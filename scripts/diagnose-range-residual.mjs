import fs from 'node:fs/promises';
import {createFreeFirstRangeImages} from '../server/range-free-images.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget} from '../server/credit-budget.mjs';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {rebuildStoredRangeViews} from '../server/rebuild-range-views.mjs';
import {treeHeightConflict} from '../web/catalogue-model.mjs';
import {atomicJson} from '../server/sync.mjs';

// A single owner-dispatched diagnostic saves exact source records for review.
// It does not modify catalogue facts or send email, even when a source disagrees.
const reportFile='web/range-residual-diagnostic-20261123.json';
const request=JSON.parse(await fs.readFile('web/range-residual-repair-request.json','utf8'));
if(request.authorization!=='owner-all-collection-unrestricted-20261123'||!request.freeProof?.attempts?.length||request.freeProof.attempts.some(a=>a.status!==403))throw Error('The documented ordinary free access failures are required');
const report={startedAt:new Date().toISOString(),requestId:request.id,sourceRecords:[],sourceFailures:[],imageEntries:{},imageFailures:[],freeImageAttempts:[],directoryRequests:0,catalogueFactsChanged:false,mailSent:false};
await atomicJson(reportFile,report);
const {products}=await rebuildStoredRangeViews({persist:false,includeProducts:true,verifyImageFiles:false});
if(!products?.length)throw Error('Committed official products could not be reconstructed');
const wanted=new Set(request.lowResolutionSkus),selected=products.filter(p=>treeHeightConflict(p)?.resolution==='unresolved'||wanted.has(String(p.sku)));
const bySku=new Map(selected.map(p=>[String(p.sku),p]));
const policy={...await loadPolicy(),catalogueTransport:'enhanced-batch',nativeCaptureEnabled:false,repairImagesOnly:true,familyBatchSize:25,familyBatchConcurrency:6,familyFetchTimeoutMs:10000,maxRunSeconds:1500,maxSessionSeconds:120,imageBatchProbe:false};
const budget=await openCreditBudget(policy);let reader,mapCost=0,mapBillingVerified=true,freeImages;
try{
 reader=await createFirecrawlBrowserReader({policy,budget:{get limit(){return budget.limit-mapCost;},async extend(o){return budget.extend({...o,creditsAlreadyBilled:(o?.creditsAlreadyBilled||0)+mapCost});}}});
 // Free sitemap HTTP, HTTP/2 and isolated Chrome were all denied. One provider
 // map is used for canonical discovery only, never as verified product content.
 try{
  const response=await fetch('https://api.firecrawl.dev/v2/map',{method:'POST',headers:{authorization:'Bearer '+process.env.FIRECRAWL_API_KEY,'content-type':'application/json'},body:JSON.stringify({url:'https://www.therange.co.uk',search:'christmas',sitemap:'include',includeSubdomains:false,ignoreQueryParameters:true,limit:100000}),signal:AbortSignal.timeout(105000)});
  const body=await response.json();const confirmed=body.creditsUsed??body.metadata?.creditsUsed;
  mapCost=Number.isFinite(confirmed)?confirmed:1;mapBillingVerified=Number.isFinite(confirmed);
  report.map={id:body.id||null,status:response.status,success:response.ok&&body.success!==false,credits:mapCost,billingVerified:mapBillingVerified,links:body.links||[],error:String(body.error?.message||body.error||'').slice(0,180)};
  if(report.map.success)for(const p of products.filter(p=>request.missingDetailSkus.includes(String(p.sku)))){
   const old=new URL(p.sourceUrl),family=old.pathname.match(/\/[mp](\d+)\/?$/)?.[1];
   for(const entry of report.map.links){const raw=typeof entry==='string'?entry:entry.url;let u;try{u=new URL(raw);}catch{continue;}
    if(u.origin!=='https://www.therange.co.uk'||!family||u.pathname.match(/\/[mp](\d+)\/?$/)?.[1]!==family)continue;
    u.search='';u.hash=String(p.sku);if(u.pathname.replace(/\/$/,'')===old.pathname.replace(/\/$/,''))continue;
    // The family suffix narrows candidates. reader.raw and parseDetails still
    // require the exact SKU code, variant and family identities before any use.
    bySku.set(String(p.sku),{...p,sourceUrl:u.href,previousSourceUrl:p.sourceUrl});break;
   }
  }
 }catch(e){mapCost=1;mapBillingVerified=false;report.map={success:false,error:String(e.message).slice(0,180),credits:1,billingVerified:false};}
 await atomicJson(reportFile,report);
 const capture=[...bySku.values()];
 for(let n=0;n<capture.length;n+=25){const batch=capture.slice(n,n+25);try{await reader.prepareFamilies(batch);}catch(e){report.sourceFailures.push({phase:'prepare',error:e.message});}
  for(const p of batch)try{
   const data=await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown']});
   if(String(data.data?.sourceVariant?.sku)!==String(p.sku))throw Error('Exact requested source SKU missing');
   report.sourceRecords.push({sku:String(p.sku),sourceUrl:p.sourceUrl,previousSourceUrl:p.previousSourceUrl||null,expectedVariantId:String(p.variantId),data});
  }catch(e){report.sourceFailures.push({sku:String(p.sku),sourceUrl:p.sourceUrl,status:e.status||0,error:String(e.message).slice(0,180),sourceResponse:e.sourceResponse});}
  await atomicJson(reportFile,report);console.log(JSON.stringify({phase:'exact-source-residual-review',requested:capture.length,sourceRecords:report.sourceRecords.length,failed:report.sourceFailures.length}));
 }
 const imageRows=new Map(request.gallery.filter(r=>!r.freeAlreadySaved).map(r=>[r.url,{url:r.url,bindings:r.bindings}]));
 // Include newly discovered full-size images only when explicitly associated
 // with a requested exact variant in the freshly verified official family.
 for(const r of report.sourceRecords){const v=r.data.data.sourceVariant,f=r.data.data.familyEvidence;
  for(const g of f.originalGallery||[])if(g.variants?.includes(String(v.id))&&new URL(g.url,f.url).origin==='https://www.therange.co.uk'){
   const url=new URL(g.url,f.url).href;if(!imageRows.has(url))imageRows.set(url,{url,bindings:[{sku:r.sku,variantId:String(v.id),page:f.url}]});
  }
 }
 // Recheck the current server's free route before any paid image transfer.
 // Network denials apply for this execution only; next execution tries again.
 const pending=[];freeImages=createFreeFirstRangeImages();
 for(const row of imageRows.values()){
  const result=await freeImages.read(row.url);
  if(result.ok)report.imageEntries[row.url]={...result,bindings:row.bindings};
  else if(result.freeMethodsExhausted&&!result.sourceMissing)pending.push({sku:row.bindings[0].sku,variantImageUrl:row.url});
  else report.imageFailures.push(result);
 }
 report.freeImageAttempts=freeImages.attempts;
 if(pending.length){
  const audit=await reader.auditImages(pending,{}, {bodyBatchSize:24});
  for(const[url,e]of Object.entries(audit.entries))report.imageEntries[url]={...e,sourceBytesUnchanged:true,bindings:imageRows.get(url)?.bindings};
  report.imageFailures.push(...audit.failures);report.imageAudit={checked:audit.checked,loaded:audit.loaded,failed:audit.failed};
 }

}catch(e){report.error=String(e.message).slice(0,300);process.exitCode=1;}
finally{
 await freeImages?.close().catch(()=>{});await reader?.close();const metrics=reader?.metrics()||{firecrawlCredits:0};report.metrics=metrics;report.completedAt=new Date().toISOString();report.firecrawlCredits=(metrics.firecrawlCredits||0)+mapCost;report.billingVerified=metrics.billingVerified!==false&&mapBillingVerified;
 await budget.settle({credits:report.firecrawlCredits,receipt:{...metrics.receipt,creditsBilled:report.firecrawlCredits,mapCredits:mapCost,billingVerified:report.billingVerified},report:{mode:'read-only-Range-residual-diagnostic',sourceRecords:report.sourceRecords.length,imageEntries:Object.keys(report.imageEntries).length}});
 await atomicJson(reportFile,report);console.log(JSON.stringify({sourceRecords:report.sourceRecords.length,imageEntries:Object.keys(report.imageEntries).length,firecrawlCredits:report.firecrawlCredits,billingVerified:report.billingVerified,error:report.error||null}));
}
