import {publishCollectionCheckpoint} from '../server/collection-checkpoints.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {asdaBatchScript,parseSavedAsdaPage,asdaPageParserSource,asdaDirectoryScript,asdaGroupsScript} from '../server/asda-source.mjs';
import {normaliseAsdaProduct,asdaFingerprint,asdaVariantListings} from '../server/asda-products.mjs';
import {ASDA_DEPARTMENTS,asdaMemberships} from '../web/asda-model.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget,reserveCredits,readLedger,runKey} from '../server/credit-budget.mjs';
import {atomicJson} from '../server/sync.mjs';
const DIR='web/asda',ROOT='https://direct.asda.com/george/christmas/trees-decorations/D18M2G1,default,sc.html',read=async(name,fallback)=>fs.readFile(DIR+'/'+name,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return fallback;throw e;});
await fs.mkdir(DIR,{recursive:true});
const request=await read('request.json',{}),previous=await read('catalogue.json',{products:[]}),checkpoint=await read('checkpoint.json',{details:{}}),initial=!previous.notificationBaselineReady;
if(process.env.GITHUB_EVENT_NAME==='push'&&!['pending','needs-evidence'].includes(request.state)){console.log('ASDA request already completed; no paid requests');process.exit(0);}
const nowBjt=new Date(Date.now()+28800000).toISOString().slice(0,10),dailyDueAt=Date.parse(nowBjt+'T07:00:00+08:00');if(!initial&&process.env.GITHUB_EVENT_NAME!=='push'&&Date.parse(previous.observedAt)>=dailyDueAt){console.log('ASDA daily source observation already completed; no duplicate paid requests');process.exit(0);}
const key=process.env.FIRECRAWL_API_KEY;if(!key)throw Error('Firecrawl server credential required');
const policy=await loadPolicy(),ledger=await readLedger(),period=new Date(Date.now()+28800000).toISOString().slice(0,7),alreadyUsed=(ledger.periods[period]?.runs||[]).filter(r=>r.key===runKey()).reduce((n,r)=>n+r.credits,0);policy.maxCreditsPerRun=Math.max(0,policy.maxCreditsPerRun-alreadyUsed);let budget,credits=0,requests=0,uncertain=0;const receipts=[];
async function api(body){
 if(credits>=budget.limit||requests>=Math.min(budget.limit,60))throw Error('ASDA bounded run request limit reached');requests++;
 const r=await fetch('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(115000)});const result=await r.json(),d=result.data;
 const cost=d?.metadata?.creditsUsed??result.metadata?.creditsUsed;credits+=Number.isFinite(cost)?cost:1;if(!Number.isFinite(cost))uncertain++;
 receipts.push({id:d?.metadata?.scrapeId||result.id||null,credits:Number.isFinite(cost)?cost:1,billingVerified:Number.isFinite(cost)});
 if(!r.ok||result.success===false||d?.metadata?.statusCode!==200)throw Error('ASDA Firecrawl response HTTP '+r.status+' / '+d?.metadata?.statusCode);
 let value=d.actions?.javascriptReturns?.[0]?.value;if(typeof value==='string')value=JSON.parse(value);return {value,html:d.rawHtml};
}
const actionBody=(url,script)=>({url,formats:['rawHtml'],onlyMainContent:false,maxAge:0,proxy:'basic',parsers:[],timeout:90000,actions:[{type:'executeJavascript',script}]});
try{
 const r=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)}),balance=await r.json();if(!r.ok||!Number.isFinite(balance.data?.remainingCredits))throw Error('ASDA account balance not verified');
 await reserveCredits(policy,{accountRemaining:balance.data.remainingCredits});budget=await openCreditBudget(policy);
 await atomicJson(DIR+'/status.json',{state:'collecting',startedAt:new Date().toISOString(),baselineReady:previous.baselineReady||false});
 const directory=await api(actionBody(ROOT+'?start=0&sz=600',asdaDirectoryScript()));
 const first=directory.value||parseSavedAsdaPage(directory.html);if(!first.search||!first.enriched?.length)throw Error('ASDA listing payload missing');
 const pageSize=first.search.pageSize,count=first.search.count,total=first.search.totalCount||count;if(!Number.isInteger(total)||total<1||total>10000)throw Error('ASDA invalid total');
 await atomicJson(DIR+'/source-directory.json',{observedAt:new Date().toISOString(),...first});
 const listingRows=d=>[...(d.search?.products||[]).filter(p=>/^(?:\d{8,12}|GEM\d{4,12}|SET\d{4,12})$/.test(String(p.id))),...(d.enriched||[])];
 const listings=new Map(listingRows(first).map(p=>[p.id,p]));
 console.log(JSON.stringify({phase:'ASDA source row reconciliation',total,pageSize,enriched:first.enriched.length,productRows:first.search.products.length,otherRows:first.search.products.filter(p=>!first.enriched.some(e=>e.id===p.id)).map(p=>({id:p.id,name:p.name,keys:Object.keys(p),url:p.URL,error:p.error}))}));
 if(listings.size<total){const items=[];for(let start=pageSize;start<total;start+=pageSize)items.push({url:ROOT+'?start='+start+'&sz='+pageSize});for(let i=0;i<items.length;i+=18){const out=await api(actionBody(ROOT,asdaBatchScript(items.slice(i,i+18))));if(!Array.isArray(out.value))throw Error('ASDA pagination batch missing');for(const row of out.value){if(row.status!==200||row.data?.search?.totalCount!==total)throw Error('ASDA pagination changed or incomplete');for(const p of listingRows(row.data))listings.set(p.id,p);}}}
 const nonProductCount=(first.search.products||[]).filter(p=>!/^(?:\d{8,12}|GEM\d{4,12}|SET\d{4,12})$/.test(String(p.id))).length;
 if(listings.size!==total&&listings.size+nonProductCount!==total)throw Error('ASDA catalogue completeness mismatch '+listings.size+'/'+total);
 console.log(JSON.stringify({phase:'ASDA source totals',realProducts:listings.size,advertisedTotal:total,nonProductTiles:nonProductCount}));
 const observedAt=new Date().toISOString();checkpoint.history||={};if(initial)for(const [sku,d]of Object.entries(checkpoint.details))checkpoint.history[sku]||={sku,baselineRecord:true,everInStock:d.product?.productAvailable===true};const old=new Map([...Object.values(checkpoint.history),...previous.products].map(p=>[p.sku,p])),products=[];
 const groupRows=first.groupRows||[],missingGroups=[...listings.values()].filter(p=>/^(?:GEM|SET)\d+$/.test(p.id)&&!groupRows.some(r=>r.sku===p.id));
 for(let i=0;i<missingGroups.length;i+=12){const out=await api(actionBody(ROOT,asdaGroupsScript(missingGroups.slice(i,i+12))));if(!Array.isArray(out.value))throw Error('ASDA grouped product rows missing');groupRows.push(...out.value);}
 for(const row of groupRows){if(row.status!==200||!row.data?.product)throw Error('ASDA grouped product not verified: '+row.sku);const raw=listings.get(row.sku),full=row.data.product,group=normaliseAsdaProduct(raw,full,{observedAt:row.observedAt,previous:old.get(row.sku),baseline:initial});checkpoint.details[row.sku]={fingerprint:asdaFingerprint(group),product:full,observedAt:row.observedAt};
  if(full.productType==='master'){
   if(!row.data.pricing)throw Error('ASDA exact size prices missing: '+row.sku);
   for(const v of asdaVariantListings(full,raw,row.data.pricing)){listings.set(v.listing.id,v.listing);const p=normaliseAsdaProduct(v.listing,v.detail,{observedAt:row.priceObservedAt||row.observedAt,previous:old.get(v.listing.id),baseline:initial});checkpoint.details[p.sku]={fingerprint:asdaFingerprint(p),product:v.detail,observedAt:row.priceObservedAt||row.observedAt};}
  }
 }
 await atomicJson(DIR+'/checkpoint.json',checkpoint);

 for(const listing of listings.values()){
  let detail=checkpoint.details[listing.id];const prior=old.get(listing.id),probe=normaliseAsdaProduct(listing,null,{observedAt,previous:prior,baseline:initial});
  if(detail?.fingerprint!==asdaFingerprint(probe)||Date.now()-Date.parse(detail.observedAt)>=7*86400000)detail=null;
  const p=normaliseAsdaProduct(listing,detail?.product,{observedAt,previous:prior,baseline:initial});if(detail)p.attributeObservedAt=detail.observedAt;
  products.push(p);
 }
 for(const p of products)checkpoint.history[p.sku]=Object.fromEntries(['sku','baselineRecord','everInStock','firstNewObservedAt','firstSeenAfterBaselineAt','arrivalEvidence','everNew','detailInputFingerprint'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
 await atomicJson(DIR+'/checkpoint.json',checkpoint);
 await atomicJson(DIR+'/directory-checkpoint.json',{observedAt,total,products});
 const needed=products.filter(p=>!p.detailsReady||Date.now()-Date.parse(p.attributeObservedAt)>=7*86400000||p.detailInputFingerprint!==old.get(p.sku)?.detailInputFingerprint&&!checkpoint.details[p.sku]);
 for(let i=0;i<needed.length;i+=36){const batch=needed.slice(i,i+36),out=await api(actionBody(ROOT,asdaBatchScript(batch.map(p=>({sku:p.sku,url:p.sourceUrl})))));if(!Array.isArray(out.value))throw Error('ASDA detail batch missing');
  for(const row of out.value){const index=products.findIndex(p=>p.sku===row.sku),p=products[index];if(row.status!==200||!row.data?.product){p.detailIssue={status:row.status,observedAt:row.observedAt||observedAt};p.detailsReady=false;continue;}
   const fresh=normaliseAsdaProduct(listings.get(p.sku),row.data.product,{observedAt:row.observedAt,previous:p,baseline:initial});fresh.observedAt=observedAt;products[index]=fresh;checkpoint.details[p.sku]={fingerprint:asdaFingerprint(fresh),product:row.data.product,observedAt:row.observedAt};
  }
  await atomicJson(DIR+'/checkpoint.json',checkpoint);await atomicJson(DIR+'/directory-checkpoint.json',{observedAt,total,products});console.log(JSON.stringify({phase:'ASDA exact SKU checkpoint',processed:Math.min(i+36,needed.length),total:needed.length,credits}));
 }
 const ready=products.filter(p=>p.detailsReady),snapshot={retailerId:'asda',sourceUrl:ROOT,observedAt,baselineReady:ready.length===products.length,notificationBaselineReady:previous.notificationBaselineReady||false,notificationBaselineAt:previous.notificationBaselineAt||null,totalSourceProducts:total,uniqueSourceSkus:[...listings.keys()].filter(id=>/^\d+$/.test(id)).length,expandedVariants:listings.size-total,products,revision:createHash('sha256').update(JSON.stringify(products)).digest('hex')};
 await atomicJson(DIR+'/catalogue.json',snapshot);
 await atomicJson(DIR+'/status.json',{state:ready.length===products.length?'active':'active-with-source-issues',baselineReady:snapshot.baselineReady,observedAt,total,productRecords:products.length,uniqueSourceSkus:snapshot.uniqueSourceSkus,expandedVariants:snapshot.expandedVariants,products:products.filter(p=>p.inStock&&p.recordType==='sku').length,details:ready.length,issues:products.filter(p=>p.detailIssue).map(p=>({sku:p.sku,...p.detailIssue})),firecrawlCredits:credits,requests});
 request.state=snapshot.baselineReady?'complete':'needs-evidence';request.completedAt=new Date().toISOString();await atomicJson(DIR+'/request.json',request);
 console.log(JSON.stringify({phase:'ASDA collection complete',total,details:ready.length,credits,requests}));
}catch(e){await atomicJson(DIR+'/status.json',{state:'error',lastSuccess:previous.observedAt||null,error:String(e.message).slice(0,250),requests,firecrawlCredits:credits,checkedAt:new Date().toISOString()});console.error(e.message);process.exitCode=1;}
finally{if(budget)await budget.settle({credits,receipt:{receipts,billingVerified:uncertain===0},report:{retailerId:'asda',firecrawlCredits:credits,overallRunCredits:alreadyUsed+credits,asdaCredits:credits,otherRetailerCredits:alreadyUsed,requests,billingVerified:uncertain===0,completedAt:new Date().toISOString()}});}

if(budget&&process.env.COLLECTION_CHECKPOINTS==='1')await publishCollectionCheckpoint({stage:'asda-source'});
