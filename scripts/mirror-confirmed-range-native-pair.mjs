import fs from 'node:fs/promises';
import {ProductDOMParser as DOMParser} from '../server/range-free-source.mjs';
import {readFamilyBundle,createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {parseDetails} from '../server/details.mjs';
import {createFreeFirstRangeImages} from '../server/range-free-images.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget,readLedger} from '../server/credit-budget.mjs';
import {atomicJson} from '../server/sync.mjs';
const reportFile='web/range-native-resolution-inspection.json',report=JSON.parse(await fs.readFile(reportFile,'utf8')),record=report.results.find(r=>r.sku==='4338038');
const ledger=await readLedger();for(const period of Object.values(ledger.periods)){const key='45065012462-1';if(period.reservations?.[key]){delete period.reservations[key];period.runs||=[];period.runs.push({key,credits:0,completedAt:new Date().toISOString(),receipt:{sourceRequests:0,sourceCollectionStarted:false,reason:'Saved job log proves local empty-fragment parser failed before opening a provider reader; release only the unused reservation.'}});await atomicJson('web/collection-ledger.json',ledger);}}
if(!record||record.jsonStatus!==200||record.htmlStatus!==200||record.json.variant_arr.length!==1||String(record.json.variant_arr[0].sku)!=='4338038')throw Error('The saved exact single-SKU source is required');
const familyUrl=record.sourceUrl.split('#')[0].replace(/\/$/,''),parse=new Function('DOMParser','payload','return ('+readFamilyBundle.toString()+')(payload)'),bundle=await parse(DOMParser,{url:familyUrl,jsonUrl:familyUrl+'?json',initial:record.json,providedHtml:record.sourceHtml,anchors:[{sku:'4338038',variantId:String(record.json.variant_arr[0].id)}]});bundle.evidence.observedAt=record.observedAt;
const data={success:true,data:{metadata:{statusCode:200},sourceVariant:bundle.variants[0],familyEvidence:bundle.evidence}},details=parseDetails(data,'4338038',record.sourceUrl),images=details.originalImages;
if(images.length!==2||images.some(g=>!g.thumbnail||g.url===g.thumbnail||g.selectedSku!=='4338038'))throw Error('Only the two explicitly paired official originals may be mirrored');
const free=createFreeFirstRangeImages(),budget=await openCreditBudget(await loadPolicy()),entries={},pending=[];let reader;
try{
 for(const g of images){const r=await free.read(g.url);if(r.ok)entries[g.url]=r;else if(r.freeMethodsExhausted&&!r.sourceMissing)pending.push({sku:'4338038',variantImageUrl:g.url});else throw Error('Official original unavailable through all free methods');}
 if(pending.length){reader=await createFirecrawlBrowserReader({policy:{...await loadPolicy(),catalogueTransport:'enhanced-batch',nativeCaptureEnabled:false,repairImagesOnly:true},budget});const audit=await reader.auditImages(pending,{}, {bodyBatchSize:24});Object.assign(entries,audit.entries);if(audit.failed)throw Error('Paired native original transfer incomplete');}
 if(images.some(g=>!entries[g.url]?.ok||entries[g.url].width<1000||entries[g.url].height<1000))throw Error('The actual source did not provide high-resolution native pixels');
 const catalogue=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),p=catalogue.products.find(p=>p.sku==='4338038');if(!p||String(p.variantId)!==String(bundle.variants[0].id))throw Error('Current exact SKU identity changed');
 const pack=JSON.parse(await fs.readFile('web/range-residual-reviewed-evidence.json','utf8'));pack.records=pack.records.filter(r=>r.sku!=='4338038');pack.records.push({sku:p.sku,variantName:p.variantName,expectedVariantId:String(p.variantId),sourceUrl:record.sourceUrl,data});Object.assign(pack.nativeEntries,entries);await atomicJson('web/range-residual-reviewed-evidence.json',pack);
 report.nativeMirror={sku:p.sku,images:Object.values(entries),freeAttempts:free.attempts,completedAt:new Date().toISOString(),upscaled:false,recompressed:false};
}catch(e){report.nativeMirror={error:String(e.message).slice(0,250),freeAttempts:free.attempts};process.exitCode=1;}
finally{await free.close();await reader?.close();const metrics=reader?.metrics()||{firecrawlCredits:0};report.nativeMirror.metrics=metrics;await budget.settle({credits:metrics.firecrawlCredits||0,receipt:metrics.receipt,report:{mode:'two-observed-exact-SKU-original-pairs'}});await atomicJson(reportFile,report);console.log(JSON.stringify({sku:'4338038',nativeImages:report.nativeMirror.images?.map(e=>({width:e.width,height:e.height,hash:e.hash})),credits:metrics.firecrawlCredits||0,billingVerified:metrics.billingVerified,error:report.nativeMirror.error||null}));}
