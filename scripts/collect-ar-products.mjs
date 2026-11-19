import{collectArDirectories}from'../server/ar-directory-collector.mjs';
import fs from'node:fs/promises';
import{gzipSync,gunzipSync}from'node:zlib';
import{createHash}from'node:crypto';
import{arBatchAction}from'../server/ar-browser-batch.mjs';
const base='web/ar',runtime='runtime/ar-source',read=(file,fallback)=>fs.readFile(file).then(b=>JSON.parse(file.endsWith('.gz')?gunzipSync(b).toString():b.toString())).catch(e=>{if(e.code==='ENOENT')return fallback;throw e;});
const grant=await read('web/argos-collection-authorization.json',{});if(grant.retailerId!=='ar'||!grant.enabled||!grant.scheduledPaidCollection)throw Error('Explicit Argos collection grant required');if(!process.env.FIRECRAWL_API_KEY)throw Error('Existing private Firecrawl configuration required');
await fs.mkdir(base,{recursive:true});await fs.mkdir(runtime,{recursive:true});
if(process.env.AR_REFRESH_DIRECTORIES==='true')await collectArDirectories({key:process.env.FIRECRAWL_API_KEY});
const source=await read(base+'/source-directory.json',null);if(!source?.complete||source.categories.some(c=>!c.complete))throw Error('Complete accepted Argos directory membership required');
const sourceRows=new Map;for(const c of source.categories)for(const page of c.pages)for(const row of page.props.productData){if(!/^[a-z0-9]{7,8}$/.test(String(row.id)))throw Error('Invalid exact Argos product ID');const old=sourceRows.get(String(row.id));if(!old||row.attributes?.price!=null)sourceRows.set(String(row.id),row);}
const prior=await read(base+'/source-products.json.gz',{}),checkpoint=await read(runtime+'/checkpoint.json.gz',{}),records={...prior};for(const[k,v]of Object.entries(checkpoint))if(sourceRows.has(k)&&(!records[k]||Date.parse(v.observedAt)>Date.parse(records[k].observedAt)))records[k]=v;
const receipts=await read(base+'/collection-ledger.json',{retailerId:'ar',receipts:[]}),attempts=new Map,failures=[],started=Date.now();let calls=0,batchSize=48,lastStatus,contextIndex=0;const contexts=['https://www.argos.co.uk/product/8763057','https://www.argos.co.uk/browse/gifts-and-occasions/christmas-decorations/christmas-tree-decorations/c:1055244/'];
const fingerprint=row=>createHash('sha256').update(JSON.stringify([row.attributes?.name,row.attributes?.productName,row.attributes?.image,row.attributes?.imageUrl,row.attributes?.imageURL])).digest('hex');
const write=async(file,value)=>{const text=JSON.stringify(value),tmp=file+'.tmp';await fs.writeFile(tmp,file.endsWith('.gz')?gzipSync(text):text);await fs.rename(tmp,file);};
const valid=(sku,d)=>String(d?.structuredProduct?.sku)===sku&&new URL(d.sourceUrl).origin==='https://www.argos.co.uk';
for(const sku of Object.keys(records))if(!sourceRows.has(sku)||!valid(sku,records[sku]))delete records[sku];
async function save(){const pending=[...sourceRows.keys()].filter(sku=>!records[sku]);lastStatus={retailerId:'ar',sourceObservedAt:source.observedAt,checkedAt:new Date().toISOString(),expected:sourceRows.size,verified:Object.keys(records).length,pending,complete:pending.length===0,failures,callsThisRun:calls,confirmedCredits:receipts.receipts.filter(r=>r.billingVerified).reduce((n,r)=>n+r.credits,0)};await write(base+'/source-products.json.gz',records);await write(runtime+'/checkpoint.json.gz',records);await write(base+'/source-detail-status.json',lastStatus);await write(base+'/collection-ledger.json',receipts);console.log(JSON.stringify({phase:'Argos exact source checkpoint',verified:lastStatus.verified,expected:lastStatus.expected,pending:pending.length,callsThisRun:calls,confirmedCredits:lastStatus.confirmedCredits}));return pending;}
for(const[sku,row]of sourceRows){const d=records[sku];if(!d)continue;const title=row.attributes?.name||row.attributes?.productName;if(d.detailIdentityFingerprint&&title&&title.replaceAll('&amp;','&').trim()!==d.structuredProduct.name.replaceAll('&amp;','&').trim()){delete records[sku];continue;}if(d.detailIdentityFingerprint&&d.detailIdentityFingerprint!==fingerprint(row))delete records[sku];else if(process.env.AR_REFRESH_DIRECTORIES==='true'&&row.attributes?.price==null&&Date.parse(d.observedAt)<Date.parse(source.observedAt))delete records[sku];else d.detailIdentityFingerprint=fingerprint(row);}
let pending=await save();while(pending.length&&calls<100&&Date.now()-started<70*60000){
 const eligible=pending.filter(sku=>(attempts.get(sku)||0)<2).sort((a,b)=>(attempts.get(a)||0)-(attempts.get(b)||0));if(!eligible.length)break;const skus=eligible.slice(0,batchSize),root=skus[0],contextUrl=contexts[contextIndex%contexts.length],payload={url:contextUrl,formats:['rawHtml'],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'NL',languages:['en-GB']},skipTlsVerification:false,parsers:[],timeout:240000,actions:[{type:'executeJavascript',script:arBatchAction({skus,collectDirectories:false})}]};
 calls++;const receipt={operation:'Argos exact product batch',startedAt:new Date().toISOString(),rootSku:root,contextUrl,requested:skus.length,payloadSha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),credits:null,billingVerified:false};
 try{const r=await fetch('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{authorization:'Bearer '+process.env.FIRECRAWL_API_KEY,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(270000)}),body=await r.json(),d=body.data||{};receipt.httpStatus=r.status;receipt.scrapeId=d.metadata?.scrapeId||null;receipt.credits=d.metadata?.creditsUsed??null;receipt.billingVerified=Number.isFinite(receipt.credits);receipt.error=body.error||null;
  if(!r.ok||!body.success)throw Error('Source service returned '+r.status+': '+String(body.error?.code||body.error||''));
  let data=d.actions?.javascriptReturns?.[0]?.value;if(typeof data==='string')data=JSON.parse(data);if(!Array.isArray(data?.products)||!Array.isArray(data.failures))throw Error('Source browser did not return exact product records');
  const selected=new Set(skus);for(const p of data.products){if(!selected.has(p.sku)||!valid(p.sku,p)||p.structuredProduct.offers?.priceCurrency!=='GBP')throw Error('Returned product identity/currency outside requested source');records[p.sku]={...p,detailIdentityFingerprint:fingerprint(sourceRows.get(p.sku))};}
  for(const f of data.failures){attempts.set(f.sku,(attempts.get(f.sku)||0)+1);failures.push({...f,scrapeId:receipt.scrapeId,observedAt:new Date().toISOString()});}
  if(data.failures.some(f=>f.status===403||f.status===429))batchSize=Math.max(12,Math.floor(batchSize*.75));else if(data.products.length===skus.length)batchSize=Math.min(64,batchSize+8);
  receipt.received=data.products.length;receipt.sourceRequests=data.requests;receipt.failures=data.failures.length;
 }catch(e){contextIndex++;failures.push({stage:'source-context',contextUrl,error:e.message,observedAt:new Date().toISOString()});receipt.localError=e.message;batchSize=Math.max(12,Math.floor(batchSize*.75));}
 receipt.completedAt=new Date().toISOString();receipts.receipts.push(receipt);await write(runtime+'/receipt-'+calls+'.json',receipt);pending=await save();
 // Do not keep resubmitting an unchanged unavailable root or assume a failure is
 // a negative catalogue result. Other exact products continue independently.
 // A rejected exact product is not proof that another product is unavailable.
 // Context transport errors are not attributed to an unrequested product.
 // The finite run bound remains separate from individual product attempts.
 if(pending.length)await new Promise(r=>setTimeout(r,2000));
}
if(pending.length)throw Error('Argos exact detail acceptance pending for '+pending.length+' products; current verified evidence is saved');
console.log(JSON.stringify({complete:true,products:Object.keys(records).length,sourceCounts:Object.fromEntries(source.categories.map(c=>[c.id,c.expected])),callsThisRun:calls,confirmedCredits:lastStatus.confirmedCredits}));
