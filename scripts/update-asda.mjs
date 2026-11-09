import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {asdaBatchScript,parseSavedAsdaPage,asdaPageParserSource} from '../server/asda-source.mjs';
import {normaliseAsdaProduct,asdaFingerprint} from '../server/asda-products.mjs';
import {ASDA_DEPARTMENTS,asdaMemberships} from '../web/asda-model.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget,reserveCredits} from '../server/credit-budget.mjs';
import {atomicJson} from '../server/sync.mjs';
const DIR='web/asda',ROOT='https://direct.asda.com/george/christmas/trees-decorations/D18M2G1,default,sc.html',read=async(name,fallback)=>fs.readFile(DIR+'/'+name,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return fallback;throw e;});
await fs.mkdir(DIR,{recursive:true});
const request=await read('request.json',{}),previous=await read('catalogue.json',{products:[]}),checkpoint=await read('checkpoint.json',{details:{}}),initial=!previous.baselineReady;
if(process.env.GITHUB_EVENT_NAME==='push'&&request.state!=='pending'){console.log('ASDA request already completed; no paid requests');process.exit(0);}
const key=process.env.FIRECRAWL_API_KEY;if(!key)throw Error('Firecrawl server credential required');
const policy=await loadPolicy();let budget,credits=0,requests=0,uncertain=0;const receipts=[];
async function api(body){
 if(requests>=Math.min(budget.limit,60))throw Error('ASDA bounded run request limit reached');requests++;
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
 const directory=await api(actionBody(ROOT+'?start=0&sz=600','('+asdaPageParserSource()+')(document.documentElement.outerHTML)'));
 const first=directory.value||parseSavedAsdaPage(directory.html);if(!first.search||!first.enriched?.length)throw Error('ASDA listing payload missing');
 const pageSize=first.search.pageSize,count=first.search.count,total=first.search.totalCount||count;if(!Number.isInteger(total)||total<1||total>10000)throw Error('ASDA invalid total');
 const listings=new Map(first.enriched.map(p=>[p.id,p]));
 if(listings.size<total){const items=[];for(let start=pageSize;start<total;start+=pageSize)items.push({url:ROOT+'?start='+start+'&sz='+pageSize});for(let i=0;i<items.length;i+=18){const out=await api(actionBody(ROOT,asdaBatchScript(items.slice(i,i+18))));if(!Array.isArray(out.value))throw Error('ASDA pagination batch missing');for(const row of out.value){if(row.status!==200||row.data?.search?.totalCount!==total)throw Error('ASDA pagination changed or incomplete');for(const p of row.data.enriched)listings.set(p.id,p);}}}
 if(listings.size!==total)throw Error('ASDA catalogue completeness mismatch '+listings.size+'/'+total);
 const observedAt=new Date().toISOString(),old=new Map(previous.products.map(p=>[p.sku,p])),products=[];
 for(const listing of listings.values()){
  let detail=checkpoint.details[listing.id];const prior=old.get(listing.id),probe=normaliseAsdaProduct(listing,null,{observedAt,previous:prior,baseline:initial});
  if(detail?.fingerprint!==asdaFingerprint(probe))detail=null;
  const p=normaliseAsdaProduct(listing,detail?.product,{observedAt,previous:prior,baseline:initial});if(detail)p.attributeObservedAt=detail.observedAt;
  products.push(p);
 }
 await atomicJson(DIR+'/directory-checkpoint.json',{observedAt,total,products});
 const needed=products.filter(p=>!p.detailsReady||p.detailInputFingerprint!==old.get(p.sku)?.detailInputFingerprint&&!checkpoint.details[p.sku]);
 for(let i=0;i<needed.length;i+=36){const batch=needed.slice(i,i+36),out=await api(actionBody(ROOT,asdaBatchScript(batch.map(p=>({sku:p.sku,url:p.sourceUrl})))));if(!Array.isArray(out.value))throw Error('ASDA detail batch missing');
  for(const row of out.value){const index=products.findIndex(p=>p.sku===row.sku),p=products[index];if(row.status!==200||!row.data?.product){p.detailIssue={status:row.status,observedAt:row.observedAt||observedAt};continue;}
   const fresh=normaliseAsdaProduct(listings.get(p.sku),row.data.product,{observedAt:row.observedAt,previous:p,baseline:initial});fresh.observedAt=observedAt;products[index]=fresh;checkpoint.details[p.sku]={fingerprint:asdaFingerprint(fresh),product:row.data.product,observedAt:row.observedAt};
  }
  await atomicJson(DIR+'/checkpoint.json',checkpoint);await atomicJson(DIR+'/directory-checkpoint.json',{observedAt,total,products});console.log(JSON.stringify({phase:'ASDA exact SKU checkpoint',processed:Math.min(i+36,needed.length),total:needed.length,credits}));
 }
 const ready=products.filter(p=>p.detailsReady),snapshot={retailerId:'asda',sourceUrl:ROOT,observedAt,baselineReady:ready.length===products.length,totalSourceProducts:total,products,revision:createHash('sha256').update(JSON.stringify(products)).digest('hex')};
 await atomicJson(DIR+'/catalogue.json',snapshot);
 await atomicJson(DIR+'/status.json',{state:ready.length===products.length?'active':'active-with-source-issues',baselineReady:snapshot.baselineReady,observedAt,total,products:products.filter(p=>p.inStock).length,details:ready.length,issues:products.filter(p=>p.detailIssue).map(p=>({sku:p.sku,...p.detailIssue})),firecrawlCredits:credits,requests});
 request.state=snapshot.baselineReady?'complete':'needs-evidence';request.completedAt=new Date().toISOString();await atomicJson(DIR+'/request.json',request);
 console.log(JSON.stringify({phase:'ASDA collection complete',total,details:ready.length,credits,requests}));
}catch(e){await atomicJson(DIR+'/status.json',{state:'error',lastSuccess:previous.observedAt||null,error:String(e.message).slice(0,250),requests,firecrawlCredits:credits,checkedAt:new Date().toISOString()});console.error(e.message);process.exitCode=1;}
finally{if(budget)await budget.settle({credits,receipt:{receipts,billingVerified:uncertain===0},report:{retailerId:'asda',firecrawlCredits:credits,requests,billingVerified:uncertain===0,completedAt:new Date().toISOString()}});}
