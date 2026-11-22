import fs from 'node:fs/promises';
import {createFreeFirstRangeSource} from '../server/range-free-source.mjs';
import {readFamilyBundle,createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget} from '../server/credit-budget.mjs';
import {atomicJson} from '../server/sync.mjs';
const request=JSON.parse(await fs.readFile('web/range-native-resolution-request.json','utf8'));
if(request.authorization!=='owner-all-collection-unrestricted-20261123'||request.products.some(p=>!['4338038','1641214','1042266','1042268'].includes(p.sku)))throw Error('Only the existing four exact low-resolution products may be inspected');
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
finally{await free.close();await reader?.close();report.completedAt=new Date().toISOString();report.metrics=reader?.metrics()||{firecrawlCredits:0};report.firecrawlCredits=report.metrics.firecrawlCredits||0;if(budget)await budget.settle({credits:report.firecrawlCredits,receipt:report.metrics.receipt,report:{mode:'exact-four-native-resolution-source-inspection'}});await atomicJson('web/range-native-resolution-inspection.json',report);console.log(JSON.stringify({results:report.results?.length||0,firecrawlCredits:report.firecrawlCredits,error:report.error||null}));}
