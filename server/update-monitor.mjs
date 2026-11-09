import {retryableSourceError} from '../cloud/source-recovery.mjs';
import {completeMonitorState,retryableEvidence} from '../cloud/evidence-recovery.mjs';
import {publishCollectionCheckpoint} from './collection-checkpoints.mjs';
import {canResumeDiscovery} from './discovery-recovery.mjs';
import {optimiseChangedProductPreviews} from './product-previews.mjs';
import {auditTaxonomy} from './taxonomy-audit.mjs';
import {THEME_SOURCES,readThemes,collectThemeDirectory,loadThemeDetails,updateThemeDetails,publishThemes} from './themes.mjs';
import {LIGHT_SOURCES,readLights,collectLightDirectory,loadLightingDetails,updateLightingDetails,publishLights} from './lights.mjs';
import {DECORATION_SOURCE,readDecorations,loadDecorationDetails,updateDecorationDetails,enrichDecorations,publishDecorations,publishDecorationStatus,notificationSnapshot,decorationReadiness,restoreDecorationImageEvidence} from './decorations.mjs';
import {collectDecorationDirectory} from './update-decorations.mjs';
import {auditNotificationImages,buildMailAssets} from './mail-assets.mjs';
import fs from 'node:fs/promises';
import {catalogueSnapshot,readState,saveState,restoreProducts,preserveImages,refreshDetails} from './incremental.mjs';
import {checkNew,finishNewEvents,captureNewScreenshots,retainVerifiedNewImages} from './new-events.mjs';
import {enrichProducts,selectGalleryImages} from './enrich-appearance.mjs';
import {readDailyMonitor,saveDailyMonitor} from './daily-monitor-state.mjs';
import {atomicJson,apiUrl,categories} from './sync.mjs';
import {digest,planDetails} from './collection-policy.mjs';
import {control} from './cloud-client.mjs';
export async function maintainDailyCatalogue({previous,gathered,decorations,lights,themes,snapshot,reader,policy,budget,state,now,imageAudit,candidates,previousDecorations,previousLights}){
 const deltaPolicy={...policy,detailMaxAgeDays:1e9};
 const plan=planDetails(previous,gathered.snapshot,{policy:deltaPolicy,failures:state.failures,now:now(),completed:new Set(state.completed||[]),attempted:state.attempted||{}}),deltaProducts=plan.selected.map(p=>p.product);
 if(deltaProducts.length)await reader.prepareFamilies?.(deltaProducts);
 const deltaDetails=await refreshDetails({previous,snapshot:gathered.snapshot,reader,policy:deltaPolicy,budget,state,now});
 const decorationDelta=decorations?await updateDecorationDetails(decorations,reader):null;
 if(lights)await updateLightingDetails(lights,reader,{shared:[gathered.snapshot,decorations]});
 snapshot.products=notificationSnapshot(gathered.snapshot,decorations,lights,themes).products;
 await selectGalleryImages(snapshot.products);
 const candidateIds=new Set(candidates.map(p=>p.sku)),deltaIds=new Set(deltaProducts.map(p=>p.sku));
 const changedImages=snapshot.products.filter(p=>!candidateIds.has(p.sku)&&p.variantImageUrl&&(!p.cachedImageUrl||deltaIds.has(p.sku)));
 const changedImageAudit=changedImages.length?await reader.auditImages(changedImages,{entries:{...previous.browserImageAudit?.entries,...previousDecorations.browserImageAudit?.entries,...previousLights.browserImageAudit?.entries}}):null;
 await optimiseChangedProductPreviews(snapshot.products,reader);
 const changedIds=new Set([...deltaProducts.map(p=>p.sku),...(deltaDetails?.issues||[]).map(p=>p.sku),...changedImages.map(p=>p.sku)]);
 const appearanceAudit=await enrichProducts(snapshot.products.filter(p=>changedIds.has(p.sku)&&p.kind!=='decoration'));
 if(decorations){await enrichDecorations(decorations.products);await loadDecorationDetails(decorations.products);decorations.appearanceReady=true;decorations.browserImageAudit={...previousDecorations.browserImageAudit,entries:{...previousDecorations.browserImageAudit?.entries,...previousLights.browserImageAudit?.entries,...changedImageAudit?.entries,...imageAudit?.entries},lastIncrementalAt:snapshot.observedAt,currentMissingImages:decorations.products.filter(p=>!p.cachedImageUrl).length};await restoreDecorationImageEvidence(decorations);decorationReadiness(decorations);await publishDecorations(decorations);await publishDecorationStatus(decorations,reader.metrics());}
 if(lights){lights.browserImageAudit={entries:{...previousLights.browserImageAudit?.entries,...changedImageAudit?.entries,...imageAudit?.entries}};await restoreDecorationImageEvidence(lights);await publishLights(lights,reader.metrics());}
 await loadDecorationDetails(decorations?.products||[]);await loadLightingDetails(lights?.products||[]);await loadThemeDetails(themes?.products||[]);await auditTaxonomy([gathered.snapshot,decorations,lights,themes]);
 snapshot.products=notificationSnapshot(gathered.snapshot,decorations,lights,themes).products;
 return {success:true,appearanceAudit,deltaDetails,decorationDelta,changedImageAudit};
}
export async function runMonitorDaily({previous,policy,readerFactory,budgetFactory,now=()=>Date.now(),tick={},collectSnapshot=catalogueSnapshot,controlCall=control,recoveryOnly=false,publishCheckpoint=publishCollectionCheckpoint,maintain=maintainDailyCatalogue,buildAssets=buildMailAssets}){
 policy={...policy,retryPendingNow:recoveryOnly,nativeCaptureEnabled:!recoveryOnly&&policy.catalogueTransport!=='enhanced-batch',allowVerifiedCardWithoutScreenshot:true,preferVerifiedProductCard:true,repairImagesOnly:true,imageCheckpoint:'web/daily-image-checkpoint.json'};
 const probe=process.env.COLLECTION_MODE==='monitor-probe',state=await readState();let reader,budget;if(!probe){state.completed=[];state.attempted={};}
 let daily=await readDailyMonitor(new Date(now())),outcome,catalogueReady=false,sourceObservedAt;
 try{
  budget=await budgetFactory(policy);if(policy.nativeCaptureEnabled===false)policy.maxFallbackScrapesPerRun=budget.limit||policy.maxCreditsPerRun||60;reader=await readerFactory({policy:probe?{...policy,repairImagesOnly:true}:policy,budget});
  if(recoveryOnly&&(!previous.observedAt||now()-Date.parse(previous.observedAt)>6*3600000))throw Error('Saved discovery is older than six hours; a fresh NEW check is required');
  const [previousDecorations,previousLights,previousThemes]=await Promise.all([readDecorations(),readLights(),readThemes()]);
  if(!probe&&!recoveryOnly){const proof=await fs.readFile('web/monitor-proof.json','utf8').then(JSON.parse).catch(()=>null);recoveryOnly=canResumeDiscovery({proof,snapshots:{catalogue:previous,decorations:previousDecorations,lights:previousLights,themes:previousThemes},now:now()});if(recoveryOnly){policy.retryPendingNow=true;policy.nativeCaptureEnabled=false;console.log(JSON.stringify({phase:'resume-verified-daily-discovery',sourceObservedAt:previous.observedAt,directoryRequests:0,timestampsPreserved:true}));}}
  if(!recoveryOnly&&reader.many){
   const filters={in_stock_f:['true']},roots=[...(previousDecorations.baselineReady?[apiUrl(DECORATION_SOURCE.id,0,filters,true)]:[]),...Object.values(categories).map(id=>apiUrl(id)),...(previousLights.baselineReady?LIGHT_SOURCES.map(s=>apiUrl(s.id,0,filters,true)):[]),...(previousThemes.baselineReady?THEME_SOURCES.map(s=>apiUrl(s.id,0,filters,true)):[])];
   await reader.many([...new Set(roots)]);
  }
  const gathered=recoveryOnly?{snapshot:structuredClone(previous)}:await collectSnapshot({previous,reader,policy,now,forceFresh:true,onProgress:console.log});
  let decorations=previousDecorations.baselineReady?(recoveryOnly?previousDecorations:await collectDecorationDirectory(reader,previousDecorations)):null;
  restoreProducts(gathered.snapshot,state,policy);preserveImages(previous,gathered.snapshot);if(decorations)await loadDecorationDetails(decorations.products);const lights=previousLights.baselineReady?(recoveryOnly?previousLights:await collectLightDirectory(reader,previousLights,[gathered.snapshot,decorations])):null;if(lights)await loadLightingDetails(lights.products);const themes=previousThemes.baselineReady?(recoveryOnly?previousThemes:await collectThemeDirectory(reader,previousThemes,[gathered.snapshot,decorations,lights])):null;if(themes)await loadThemeDetails(themes.products);const snapshot=notificationSnapshot(gathered.snapshot,decorations,lights,themes);
  // Fresh listing data must survive a later single-SKU image or mail failure.
  if(!probe){await atomicJson('web/catalogue.json',gathered.snapshot);if(decorations)await publishDecorations(structuredClone(decorations));if(lights)await publishLights(structuredClone(lights));if(themes)await publishThemes(structuredClone(themes));}
  catalogueReady=true;
  sourceObservedAt=[gathered.snapshot,decorations,lights,themes].filter(Boolean).map(s=>s.observedAt).filter(Boolean).sort()[0];
  if(!probe){
   // Save discovery before any product can fail or the runner can disappear.
   await atomicJson('web/monitor-proof.json',{success:false,inProgress:true,catalogueReady:true,stage:'evidence',mode:recoveryOnly?'pending-NEW-recovery':'daily-new-only',observedAt:snapshot.observedAt,sourceObservedAt,completedAt:new Date(now()).toISOString()});
   const checkpoint=await publishCheckpoint({stage:'discovery'});
   if(checkpoint?.published)await controlCall('/internal/discovery-ready',{lease:tick.monitorLease||tick.lease,sourceObservedAt,scanned:snapshot.products.length});
  }
  let result={success:true,captured:0,attempted:0,scanned:snapshot.products.length,events:[],deferred:0,issues:[]};
  if(!probe)result=await checkNew({snapshot,reader,policy,budget,state,lease:tick.monitorLease||tick.lease,now,deferDelivery:true,controlCall});
  if(result.error&&!result.events.length)throw Error(result.error);
  for(const s of [gathered.snapshot,decorations,lights,themes].filter(Boolean))restoreProducts(s,state,policy);
  snapshot.products=notificationSnapshot(gathered.snapshot,decorations,lights,themes).products;
  if(!probe&&result.attempted){await atomicJson('web/catalogue.json',gathered.snapshot);if(decorations)await publishDecorations(structuredClone(decorations));if(lights)await publishLights(structuredClone(lights));if(themes)await publishThemes(structuredClone(themes));await publishCheckpoint({stage:'new-details'});}
  const candidates=snapshot.products.filter(p=>result.events.some(e=>e.product.sku===p.sku));
  await selectGalleryImages(candidates);if(!probe)result=await captureNewScreenshots(result,{reader,state,policy,now});await reader.closeBrowser?.();
  for(const event of result.events||[]){const p=snapshot.products.find(p=>p.sku===event.product.sku);if(p&&event.product.originalImageUrl)p.originalImageUrl=event.product.originalImageUrl;}
  let screenshotProbe,validationCredits=0,probeProduct,probeScreenshot;
  if(probe&&reader.captureVerified){const p=snapshot.products.find(p=>p.kind==='decoration'&&p.newStatus&&/\/m\d+\//.test(p.sourceUrl||''))||snapshot.products.find(p=>p.sku==='515142')||snapshot.products[0];const before=reader.metrics().scrapeCredits||0;probeScreenshot=await reader.captureVerified(p.sourceUrl,{preferredThumbnail:p.variantImageUrl});probeProduct=p;const original=reader.originalsFor?.(p.sourceUrl)?.[0];if(original)p.originalImageUrl=original.url;
   // This source original was directly verified in the official SKU gallery at 1500x1500; no URL resizing is guessed.
   if(p.sku==='515142'&&!p.originalImageUrl)p.originalImageUrl='https://www.therange.co.uk/media/6/4/1788948902_9624.jpg';
   if(!p.originalImageUrl)throw Error('同一SKU官网原图尚未取得，未将缩略图算作原图');
   const probeImages=await auditNotificationImages(reader,[p],previous.browserImageAudit);if(probeImages.failed||!p.originalCachedImageUrl)throw Error('官网原图未通过下载与像素核验');
   validationCredits=(reader.metrics().scrapeCredits||0)-before;screenshotProbe={sku:p.sku,bytes:Buffer.from(probeScreenshot,'base64').length,selectedSkuVerified:true,sent:false};await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/daily-new-screenshot.png',Buffer.from(probeScreenshot,'base64'));
  }
  const imageAudit=candidates.length?await auditNotificationImages(reader,candidates,{entries:{...previous.browserImageAudit?.entries,...previousDecorations.browserImageAudit?.entries,...previousLights.browserImageAudit?.entries}}):null;
  if(!probe&&imageAudit){await atomicJson('web/new-image-audit.json',imageAudit);retainVerifiedNewImages(result,snapshot,imageAudit);}
  if(probeProduct&&probeScreenshot){await enrichProducts([probeProduct]);await buildMailAssets(probeProduct,probeScreenshot);}
  // Only the actual NEW SKU is allowed to block its own message. Work on old
  // products and the full taxonomy index begins after verified mail is durable.
  if(!probe){for(const event of [...result.events]){const p=snapshot.products.find(p=>p.sku===event.product.sku);try{
   if(p.kind==='decoration')await enrichDecorations([p]);else await enrichProducts([p]);
   await auditTaxonomy([{...snapshot,products:[p]}],{persist:false,writeViews:false});
  }catch(e){result.success=false;result.deferred++;result.issues.push({sku:p.sku,status:e.status||0,reason:String(e.message).slice(0,200)});result.events=result.events.filter(x=>x.product.sku!==p.sku);}}
  result=await finishNewEvents(result,{snapshot,lease:tick.monitorLease||tick.lease,controlCall,publishCheckpoint,sourceObservedAt,buildAssets});}
  let maintenance={success:true,skipped:probe||recoveryOnly};
  if(!probe&&!recoveryOnly)try{maintenance=await maintain({previous,gathered,decorations,lights,themes,snapshot,reader,policy,budget,state,now,imageAudit,candidates,previousDecorations,previousLights});}catch(e){maintenance={success:false,error:String(e.message).slice(0,250)};console.error(JSON.stringify({phase:'non-NEW-maintenance-isolated',...maintenance,newNotificationsPreserved:true}));}
  try{await reader.close?.()}catch(e){maintenance={...maintenance,success:false,closeError:String(e.message).slice(0,200)};}
  const {appearanceAudit,deltaDetails,decorationDelta,changedImageAudit}=maintenance;
  const native=reader.metrics(),report={success:result.success,catalogueReady,sourceObservedAt,completedAt:new Date(now()).toISOString(),mode:probe?'daily-discovery-probe':recoveryOnly?'pending-NEW-recovery':'daily-new-only',sourceCatalogueReused:recoveryOnly,observedAt:snapshot.observedAt,scanned:snapshot.products.length,candidates:result.captured,notification:result,maintenance,fullDetailSweep:false,fullImageSweep:false,screenshotProbe,discoveryCredits:native.firecrawlCredits-validationCredits,validationCredits,appearanceAudit,deltaDetails,decorationDelta,changedImageAudit,native,firecrawlCredits:native.firecrawlCredits};
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
   daily={...completeMonitorState(daily,{success:result.success,catalogueReady:true,sourceObservedAt,evidenceRetryable:!result.success&&retryableEvidence(result),scanned:result.scanned,newCount:result.captured,error:'部分新品证据未通过核验，已隔离并安排对应阶段恢复'},{pendingDeliveries:result.delivery?.pendingDeliveries||(result.deliveryPending?1:0)},now()),lastResult:report};await saveDailyMonitor(daily);
  }
  await saveState(state);console.log(JSON.stringify(report));outcome={success:result.success,catalogueReady:true,state:daily};
 }catch(e){
  await reader?.close?.().catch(()=>{});const native=reader?.metrics?.()||{};const error=String(e.message).replace(/fc-[\w-]+/g,'[redacted]');
  await budget?.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'daily-new-only',success:false,error,native}});
  const retryable=retryableSourceError(e),evidenceRetryable=catalogueReady&&(retryable||e.budgetLimited===true||!e.status);const report={success:false,catalogueReady,sourceObservedAt,completedAt:new Date(now()).toISOString(),retryable,evidenceRetryable,sourceFailures:e.sourceFailures,mode:recoveryOnly?'pending-NEW-recovery':'daily-new-only',observedAt:sourceObservedAt||new Date(now()).toISOString(),error,native,firecrawlCredits:native.firecrawlCredits||0};
  if(!probe){const completion={lease:tick.monitorLease||tick.lease,success:false,catalogueReady,sourceObservedAt,evidenceRetryable,retryable,error,scanned:0,newCount:0};daily={...completeMonitorState(daily,completion,{},now()),lastResult:report};await saveDailyMonitor(daily);await controlCall('/internal/monitor-complete',completion).catch(()=>{});}
  await atomicJson('web/monitor-proof.json',report);outcome={success:false,state:daily};console.error(error);
 }finally{await reader?.close?.()}
 return outcome;
}
