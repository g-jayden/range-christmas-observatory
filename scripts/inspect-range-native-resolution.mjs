import fs from 'node:fs/promises';
import {createFreeFirstRangeSource} from '../server/range-free-source.mjs';
import {readFamilyBundle,createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget,readLedger} from '../server/credit-budget.mjs';
import {atomicJson} from '../server/sync.mjs';
const request=JSON.parse(await fs.readFile('web/range-native-resolution-request.json','utf8'));
if(request.authorization!=='owner-all-collection-unrestricted-20261123'||request.products.some(p=>!['4338038','1641214','1042266','1042268'].includes(p.sku)))throw Error('Only the existing four exact low-resolution products may be inspected');
// The previous completed collection reported one credit, but its Git step
// failed before saving the full receipt. Retain that logged amount once, with
// its uncertainty explicit, rather than silently treating it as free.
const ledger=await readLedger(),priorKey='45064093750-1',period=ledger.periods['2026-11']||={used:0,reservations:{},runs:[]};period.runs||=[];
if(!period.runs.some(r=>r.key===priorKey)){period.used+=1;period.runs.push({key:priorKey,credits:1,completedAt:'2026-11-22T20:04:17.967Z',receipt:{creditsBilled:1,billingVerified:false,source:'completed-collector-log-recovery',workflowUrl:'https://github.com/g-jayden/range-christmas-observatory/actions/runs/45064093750',note:'Collector output reported one credit; full provider receipt was lost before Git publication, and no zero-cost or refund claim is made.'}});await atomicJson('web/collection-ledger.json',ledger);}
const free=createFreeFirstRangeSource(),report={startedAt:new Date().toISOString(),products:request.products,sourceFactsChanged:false,emailsSent:0};let reader,budget;
try{
 report.freeFamilies=(await free.families(request.products,readFamilyBundle)).map(r=>({url:r.url,status:r.bundle?.status,free:true}));report.freeMetrics=free.metrics();
 if(report.freeFamilies.length===request.products.length)throw Error('Free source available: retain this result and continue free instead of starting a paid diagnostic');
 const policy={...await loadPolicy(),catalogueTransport:'enhanced-batch',nativeCaptureEnabled:false,repairImagesOnly:true,maxRunSeconds:300};budget=await openCreditBudget(policy);reader=await createFirecrawlBrowserReader({policy,budget});
 report.results=await reader.batchDocuments(async({products})=>{
  const out=[];await Promise.all(products.map(async p=>{const url=p.sourceUrl.split('#')[0].replace(/\/$/,''),r=await fetch(url+'?json',{signal:AbortSignal.timeout(15000)}),body=await r.json(),v=body.variant_arr?.find(v=>String(v.sku)===p.sku&&String(v.code)===p.sku&&String(v.id)===String(p.variantId));if(r.status!==200||!v)throw Error('Unverified exact native-source JSON');
   const h=await fetch(url,{signal:AbortSignal.timeout(15000)}),html=await h.text(),doc=new DOMParser().parseFromString(html,'text/html');
   const nodes=Array.from(doc.querySelectorAll('#available-imgs a,#available-imgs img,#product-gallery a,#product-gallery img')).map(el=>({tag:el.tagName,attributes:Object.fromEntries(el.getAttributeNames().map(k=>[k,el.getAttribute(k)]))}));
   out.push({sku:p.sku,sourceUrl:p.sourceUrl,jsonStatus:r.status,htmlStatus:h.status,json:body,galleryNodes:nodes,sourceHtml:html,observedAt:new Date().toISOString()});
  }));return out;
 },{products:request.products});
}catch(e){report.error=String(e.message).slice(0,250);process.exitCode=1;}
finally{await free.close();await reader?.close();report.completedAt=new Date().toISOString();report.metrics=reader?.metrics()||{firecrawlCredits:0};report.firecrawlCredits=report.metrics.firecrawlCredits||0;if(budget)await budget.settle({credits:report.firecrawlCredits,receipt:report.metrics.receipt,report:{mode:'exact-four-native-resolution-source-inspection'}});await atomicJson('web/range-native-resolution-inspection.json',report);console.log(JSON.stringify({results:report.results?.length||0,firecrawlCredits:report.firecrawlCredits,billingVerified:report.metrics.billingVerified,scrapeReceipts:report.metrics.scrapeReceipts,error:report.error||null}));}
