import {auditTaxonomy} from './taxonomy-audit.mjs';
import {readThemes,collectThemeDirectory,loadThemeDetails,updateThemeDetails,publishThemes} from './themes.mjs';
import {readLights,collectLightDirectory,loadLightingDetails,updateLightingDetails,publishLights} from './lights.mjs';
import {readDecorations,loadDecorationDetails,updateDecorationDetails,enrichDecorations,publishDecorations,publishDecorationStatus,notificationSnapshot,decorationReadiness,restoreDecorationImageEvidence} from './decorations.mjs';
import {collectDecorationDirectory} from './update-decorations.mjs';
import {auditNotificationImages,buildMailAssets} from './mail-assets.mjs';
import fs from 'node:fs/promises';
import {catalogueSnapshot,readState,saveState,restoreProducts,preserveImages,refreshDetails} from './incremental.mjs';
import {checkNew,finishNewEvents,captureNewScreenshots,retainVerifiedNewImages} from './new-events.mjs';
import {enrichProducts,selectGalleryImages} from './enrich-appearance.mjs';
import {readDailyMonitor,saveDailyMonitor} from './daily-monitor-state.mjs';
import {atomicJson} from './sync.mjs';
import {digest,planDetails} from './collection-policy.mjs';
import {control} from './cloud-client.mjs';
export async function runMonitorDaily({previous,policy,readerFactory,budgetFactory,now=()=>Date.now(),tick={},collectSnapshot=catalogueSnapshot,controlCall=control}){
 policy={...policy,repairImagesOnly:true,imageCheckpoint:'web/daily-image-checkpoint.json'};
 const probe=process.env.COLLECTION_MODE==='monitor-probe',state=await readState();let reader,budget;if(!probe){state.completed=[];state.attempted={};}
 let daily=await readDailyMonitor(new Date(now())),outcome;
 try{
  budget=await budgetFactory(policy);reader=await readerFactory({policy:probe?{...policy,repairImagesOnly:true}:policy,budget});
  const gathered=await collectSnapshot({previous,reader,policy,now,forceFresh:true,onProgress:console.log});
  const previousDecorations=await readDecorations();let decorations=previousDecorations.baselineReady?await collectDecorationDirectory(reader,previousDecorations):null;
  restoreProducts(gathered.snapshot,state,policy);preserveImages(previous,gathered.snapshot);if(decorations)await loadDecorationDetails(decorations.products);const previousLights=await readLights(),lights=previousLights.baselineReady?await collectLightDirectory(reader,previousLights,[gathered.snapshot,decorations]):null;if(lights)await loadLightingDetails(lights.products);const previousThemes=await readThemes(),themes=previousThemes.baselineReady?await collectThemeDirectory(reader,previousThemes,[gathered.snapshot,decorations,lights]):null;if(themes)await loadThemeDetails(themes.products);const snapshot=notificationSnapshot(gathered.snapshot,decorations,lights,themes);await reader.closeBrowser?.();
  // Fresh listing data must survive a later single-SKU image or mail failure.
  if(!probe){await atomicJson('web/catalogue.json',gathered.snapshot);if(decorations)await publishDecorations(structuredClone(decorations));if(lights)await publishLights(structuredClone(lights));if(themes)await publishThemes(structuredClone(themes));}
  let result={success:true,captured:0,attempted:0,scanned:snapshot.products.length,events:[],deferred:0,issues:[]};
  if(!probe)result=await checkNew({snapshot,reader,policy,budget,state,lease:tick.monitorLease||tick.lease,now,deferDelivery:true,controlCall});
  let deltaDetails,decorationDelta,deltaProducts=[];if(!probe){const deltaPolicy={...policy,detailMaxAgeDays:1e9};const plan=planDetails(previous,gathered.snapshot,{policy:deltaPolicy,failures:state.failures,now:now(),completed:new Set(state.completed||[]),attempted:state.attempted||{}});deltaProducts=plan.selected.map(p=>p.product);if(plan.selected.length)await reader.prepareFamilies?.(plan.selected.map(p=>p.product));deltaDetails=await refreshDetails({previous,snapshot:gathered.snapshot,reader,policy:deltaPolicy,budget,state,now});if(decorations)decorationDelta=await updateDecorationDetails(decorations,reader);if(lights)await updateLightingDetails(lights,reader,{shared:[gathered.snapshot,decorations]});}
  snapshot.products=notificationSnapshot(gathered.snapshot,decorations,lights,themes).products;
  if(!probe){await atomicJson('web/catalogue.json',gathered.snapshot);if(decorations)await publishDecorations(structuredClone(decorations));if(lights)await publishLights(structuredClone(lights));if(themes)await publishThemes(structuredClone(themes));}
  const candidates=snapshot.products.filter(p=>result.events.some(e=>e.product.sku===p.sku));
  await selectGalleryImages(candidates);await reader.closeBrowser?.();if(!probe)result=await captureNewScreenshots(result,{reader,state,policy,now});
  for(const event of result.events||[]){const p=snapshot.products.find(p=>p.sku===event.product.sku);if(p&&event.product.originalImageUrl)p.originalImageUrl=event.product.originalImageUrl;}
  let screenshotProbe,validationCredits=0,probeProduct,probeScreenshot;
  if(probe&&reader.captureVerified){const p=snapshot.products.find(p=>p.kind==='decoration'&&p.newStatus&&/\/m\d+\//.test(p.sourceUrl||''))||snapshot.products.find(p=>p.sku==='515142')||snapshot.products[0];const before=reader.metrics().scrapeCredits||0;probeScreenshot=await reader.captureVerified(p.sourceUrl,{preferredThumbnail:p.variantImageUrl});probeProduct=p;const original=reader.originalsFor?.(p.sourceUrl)?.[0];if(original)p.originalImageUrl=original.url;
   // This source original was directly verified in the official SKU gallery at 1500x1500; no URL resizing is guessed.
   if(p.sku==='515142'&&!p.originalImageUrl)p.originalImageUrl='https://www.therange.co.uk/media/6/4/1788948902_9624.jpg';
   if(!p.originalImageUrl)throw Error('同一SKU官网原图尚未取得，未将缩略图算作原图');
   const probeImages=await auditNotificationImages(reader,[p],previous.browserImageAudit);if(probeImages.failed||!p.originalCachedImageUrl)throw Error('官网原图未通过下载与像素核验');
   validationCredits=(reader.metrics().scrapeCredits||0)-before;screenshotProbe={sku:p.sku,bytes:Buffer.from(probeScreenshot,'base64').length,selectedSkuVerified:true,sent:false};await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/daily-new-screenshot.png',Buffer.from(probeScreenshot,'base64'));
  }
  await selectGalleryImages(snapshot.products);const candidateIds=new Set(candidates.map(p=>p.sku));const deltaIds=new Set(deltaProducts.map(p=>p.sku));const changedImages=!probe?snapshot.products.filter(p=>!candidateIds.has(p.sku)&&p.variantImageUrl&&(!p.cachedImageUrl||deltaIds.has(p.sku))):[];const changedImageAudit=changedImages.length?await reader.auditImages(changedImages,{entries:{...previous.browserImageAudit?.entries,...previousDecorations.browserImageAudit?.entries,...previousLights.browserImageAudit?.entries}}):null;
  const imageAudit=candidates.length?await auditNotificationImages(reader,candidates,{entries:{...previous.browserImageAudit?.entries,...previousDecorations.browserImageAudit?.entries,...previousLights.browserImageAudit?.entries,...changedImageAudit?.entries}}):null;
  if(!probe&&imageAudit){await atomicJson('web/new-image-audit.json',imageAudit);retainVerifiedNewImages(result,snapshot,imageAudit);}
  await reader.close?.();
  if(probeProduct&&probeScreenshot){await enrichProducts([probeProduct]);await buildMailAssets(probeProduct,probeScreenshot);}
  const changedIds=new Set([...deltaProducts.map(p=>p.sku),...(deltaDetails?.issues||[]).map(p=>p.sku),...changedImages.map(p=>p.sku),...candidates.map(p=>p.sku)]);const analysedProducts=snapshot.products.filter(p=>changedIds.has(p.sku));const appearanceAudit=analysedProducts.length?await enrichProducts(analysedProducts.filter(p=>p.kind!=='decoration')):{products:0,analysedImages:0,firecrawlCredits:0};
  // A failed native photo remains pending for that SKU; other verified items
  // may be delivered from their durable screenshots and original image files.
  if(!probe&&decorations){await enrichDecorations(decorations.products);await loadDecorationDetails(decorations.products);decorations.appearanceReady=true;decorations.browserImageAudit={...previousDecorations.browserImageAudit,entries:{...previousDecorations.browserImageAudit?.entries,...previousLights.browserImageAudit?.entries,...changedImageAudit?.entries,...imageAudit?.entries},lastIncrementalAt:snapshot.observedAt,currentMissingImages:decorations.products.filter(p=>!p.cachedImageUrl).length};await restoreDecorationImageEvidence(decorations);decorationReadiness(decorations);await publishDecorations(decorations);await publishDecorationStatus(decorations,reader.metrics());}
  if(!probe&&lights){lights.browserImageAudit={entries:{...previousLights.browserImageAudit?.entries,...changedImageAudit?.entries,...imageAudit?.entries}};await restoreDecorationImageEvidence(lights);await publishLights(lights,reader.metrics());}
  if(!probe){await loadDecorationDetails(decorations?.products||[]);await loadLightingDetails(lights?.products||[]);await loadThemeDetails(themes?.products||[]);await auditTaxonomy([gathered.snapshot,decorations,lights,themes]);snapshot.products=notificationSnapshot(gathered.snapshot,decorations,lights,themes).products;}
  if(!probe)result=await finishNewEvents(result,{snapshot,lease:tick.monitorLease||tick.lease,controlCall});
  const native=reader.metrics(),report={success:result.success,mode:probe?'daily-discovery-probe':'daily-new-only',observedAt:snapshot.observedAt,scanned:snapshot.products.length,candidates:result.captured,notification:result,fullDetailSweep:false,fullImageSweep:false,screenshotProbe,discoveryCredits:native.firecrawlCredits-validationCredits,validationCredits,appearanceAudit,deltaDetails,decorationDelta,changedImageAudit,native,firecrawlCredits:native.firecrawlCredits};
  await budget.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report});
  await atomicJson('web/monitor-proof.json',report);
  if(!probe){
   const updated=gathered.snapshot;updated.revision=digest({observedAt:updated.observedAt,products:updated.products});updated.updatedAt=new Date(now()).toISOString();updated.browserImageAudit={...previous.browserImageAudit,entries:{...previous.browserImageAudit?.entries,...changedImageAudit?.entries,...imageAudit?.entries},lastIncrementalAt:updated.observedAt,currentMissingImages:updated.products.filter(p=>!p.cachedImageUrl).length};updated.lastDirectoryCheck=report;await atomicJson('web/catalogue.json',updated);const status=await fs.readFile('web/status.json','utf8').then(JSON.parse).catch(()=>({}));await atomicJson('web/status.json',{...status,revision:updated.revision,stats:updated.stats,lastDirectorySuccess:updated.observedAt});
   const old=await fs.readFile('web/new-arrivals.json','utf8').then(JSON.parse).catch(()=>({products:[],history:[]}));
   const additions=snapshot.products.filter(p=>p.newStatus&&p.arrivalEvidence==='observed-after-baseline');
   const rows=new Map((old.products||[]).map(p=>[p.sku,p]));for(const p of additions)rows.set(p.sku,p);
   // Preserve daily first-NEW observations independently of full-refresh timing.
   const history=[...new Map([...(old.history||[]),...snapshot.products.filter(p=>p.firstNewObservedAt&&p.arrivalEvidence==='observed-after-baseline').map(p=>({sku:p.sku,firstNewObservedAt:p.firstNewObservedAt,firstObservedAt:p.firstObservedAt,everNew:true,arrivalEvidence:p.arrivalEvidence}))].map(p=>[p.sku,p])).values()];
   const availableSkus=snapshot.products.map(p=>p.sku);await atomicJson('web/new-arrivals.json',{version:2,observedAt:snapshot.observedAt,availableSkus,products:[...rows.values()],history,browserImageAudit:imageAudit||old.browserImageAudit,revision:digest({at:snapshot.observedAt,history,availableSkus}),sourceCheckSuccess:result.success});
   daily={...daily,state:result.success?(result.deliveryPending?'delivery-pending':'active'):'error',lastSuccess:result.success?snapshot.observedAt:daily.lastSuccess,lastError:result.success?null:'部分新品证据未通过核验，待下次每日任务处理',lastResult:report};await saveDailyMonitor(daily);
  }
  await saveState(state);console.log(JSON.stringify(report));outcome={success:result.success,catalogueReady:true,state:daily};
 }catch(e){
  await reader?.close?.().catch(()=>{});const native=reader?.metrics?.()||{};const error=String(e.message).replace(/fc-[\w-]+/g,'[redacted]');
  await budget?.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'daily-new-only',success:false,error,native}});
  if(!probe){await saveDailyMonitor({...daily,state:'error',lastError:error});await controlCall('/internal/monitor-complete',{lease:tick.monitorLease||tick.lease,success:false,error:'新品检查未完成，未将失败记录为没有新品',scanned:0,newCount:0}).catch(()=>{});}
  await atomicJson('web/monitor-proof.json',{success:false,observedAt:new Date(now()).toISOString(),error,native,firecrawlCredits:native.firecrawlCredits||0});outcome={success:false,state:daily};console.error(error);
 }finally{await reader?.close?.()}
 return outcome;
}
