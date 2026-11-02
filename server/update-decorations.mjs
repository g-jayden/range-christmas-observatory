import {selectGalleryImages} from './enrich-appearance.mjs';
import {collectPartitionedCategory} from './catalogue-partitions.mjs';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readDecorations,mergeDecorations,DECORATION_SOURCE,updateDecorationDetails,enrichDecorations,publishDecorations} from './decorations.mjs';
import {collectStableCategory,atomicJson} from './sync.mjs';
import {createFirecrawlBrowserReader} from './firecrawl-browser.mjs';
import {loadPolicy} from './collection-policy.mjs';
import {openCreditBudget} from './credit-budget.mjs';
import {control,apiBase} from './cloud-client.mjs';
export async function collectDecorationDirectory(reader,previous){return mergeDecorations(previous,await collectPartitionedCategory(DECORATION_SOURCE.id,reader));}
export async function seedDecorationBaseline(snapshot,controlCall=control){
 if(!apiBase&&controlCall===control)return;
 await controlCall('/internal/extend-baseline',{scope:'christmas-decorations-v1',records:snapshot.products.map(p=>({sku:p.sku,everNew:p.everNew||p.newStatus})),observedAt:snapshot.observedAt});
}
export async function runDecorationUpdate({readerFactory=createFirecrawlBrowserReader,budgetFactory=openCreditBudget}={}){
 const policy={...await loadPolicy(),familyBatchSize:100,familyBatchConcurrency:8,familyFetchTimeoutMs:20000,adaptiveFamilies:true,maxRunSeconds:3000,maxFallbackScrapesPerRun:56,imageBodyBatchSize:500,imageBatchProbe:true,imageCheckpoint:'web/decoration-image-checkpoint.json'},previous=await readDecorations();let reader,budget,snapshot;
 try{
  budget=await budgetFactory(policy);reader=await readerFactory({policy,budget});
  policy.repairImagesOnly=!previous.ready;const checkpoint=await fs.readFile('web/decoration-image-checkpoint.json','utf8').then(JSON.parse).catch(()=>({entries:{}}));
  let imageProbe;const probeProducts=[...new Map(previous.products.filter(p=>/^https:\/\/www\.therange\.co\.uk\/media\/.+\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(p.variantImageUrl||'')).map(p=>[p.variantImageUrl,p])).values()].slice(0,3);
  if(probeProducts.length){const checkpointPath=policy.imageCheckpoint;policy.imageCheckpoint=null;try{imageProbe=await reader.auditImages(probeProducts,{entries:{...previous.browserImageAudit?.entries,...checkpoint.entries}},{bodyBatchSize:3});}finally{policy.imageCheckpoint=checkpointPath;}await atomicJson(checkpointPath,{entries:{...checkpoint.entries,...imageProbe.entries}});console.log(JSON.stringify({phase:'image-channel-preflight',loaded:imageProbe.loaded,failed:imageProbe.failed}));policy.imageBatchProbe=false;}
  snapshot=await collectDecorationDirectory(reader,previous);console.log(JSON.stringify({phase:'decoration-directory',unique:snapshot.products.length,expected:snapshot.source.expected}));
  // The native browser is only needed for the complete shared root directory.
  // Release its billable clock before batched product-family and photo requests.
  await reader.closeBrowser();
  const detailAudit=await updateDecorationDetails(snapshot,reader);
  await selectGalleryImages(snapshot.products);
  const browserImageAudit=await reader.auditImages(snapshot.products,{...previous.browserImageAudit,entries:{...previous.browserImageAudit?.entries,...checkpoint.entries,...imageProbe?.entries}},{bodyBatchSize:500});
  await reader.close();const native=reader.metrics();
  await budget.settle({credits:native.firecrawlCredits,receipt:native.receipt,report:{mode:'christmas-decorations',native,detailAudit,products:snapshot.products.length}});
  const deferredAppearance=process.env.DECORATION_DEFER_APPEARANCE==='1';snapshot.appearanceAudit=await enrichDecorations(snapshot.products,{infer:!deferredAppearance});snapshot.appearanceReady=!deferredAppearance;snapshot.browserImageAudit=browserImageAudit;snapshot.detailAudit=detailAudit;snapshot.collectionAudit={native,completedAt:new Date().toISOString(),directoryRequestsReusedAcrossTwelveCategories:true};
  snapshot.sourceReady=detailAudit.verified===snapshot.products.length&&detailAudit.issues.length===0&&browserImageAudit.failed===0;snapshot.ready=snapshot.sourceReady&&snapshot.appearanceReady;
  // An incomplete first scan is reviewable but cannot seed NEW or pretend all fields passed.
  if(!previous.baselineReady&&snapshot.ready){await seedDecorationBaseline(snapshot);snapshot.baselineReady=true;}
  await publishDecorations(snapshot);
  await atomicJson('web/decorations-status.json',{state:snapshot.ready?'active':'needs-review',observedAt:snapshot.observedAt,products:snapshot.products.length,verified:detailAudit.verified,imageFailures:browserImageAudit.failed,native});
  console.log(JSON.stringify({success:snapshot.sourceReady,ready:snapshot.ready,products:snapshot.products.length,detailAudit,native}));return {success:snapshot.sourceReady};
 }catch(e){await reader?.close?.().catch(()=>{});const native=reader?.metrics?.()||{};await budget?.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'christmas-decorations',success:false,error:e.message,native}});
  if(snapshot){snapshot.ready=false;snapshot.collectionAudit={native,error:e.message};await publishDecorations(snapshot);}
  await atomicJson('web/decorations-status.json',{state:'error',error:String(e.message),at:new Date().toISOString(),native});throw e;
 }finally{await reader?.close?.()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1]))){const result=await runDecorationUpdate();if(!result.success)process.exitCode=1;}
