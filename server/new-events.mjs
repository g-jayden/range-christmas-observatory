import {isPublishedProduct,christmasEligibility,offeredObject} from '../web/taxonomy.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {atomicJson} from './sync.mjs';
import {buildMailAssets} from './mail-assets.mjs';
import {parseDetails,applyDetails,productInformation} from './details.mjs';
import {control} from './cloud-client.mjs';
import {productKey,detailFingerprint,failedAttempt,verified} from './collection-policy.mjs';
import {cacheProduct,saveState} from './incremental.mjs';
import {retryableEvidence} from '../cloud/evidence-recovery.mjs';
import {pinMailAssets} from '../cloud/published-mail-assets.mjs';
import {NOTIFICATION_CONTRACT} from '../cloud/notification-evidence.mjs';
import {publishCollectionCheckpoint} from './collection-checkpoints.mjs';
export async function deliverVerifiedEvents(controlCall=control){let delivery,accepted=0;for(let batch=0;batch<100;batch++){delivery=await controlCall('/internal/deliver',{});accepted+=Number(delivery.accepted||0);if(!delivery.morePending)return {...delivery,accepted};}throw Error('仍有待发邮件，已保留云端队列');}
export function reusableNewDetails(p,policy,now=Date.now()){
 const at=Date.parse(p.attributeObservedAt),day=x=>new Date(x+8*3600000).toISOString().slice(0,10);
 return Boolean(policy.retryPendingNow&&verified(p)&&p.detailInputFingerprint===detailFingerprint(p)&&Number.isFinite(at)&&at<=now&&now-at<6*3600000&&day(at)===day(now)&&p.originalImages?.length);
}
export async function checkNew({snapshot,reader,policy,budget,state,lease,dir='runtime/collection',controlCall=control,fetcher=fetch,now=()=>Date.now(),deferDelivery=false}){
 let captured=0,attempted=0,deferred=0;const issues=[],events=[],unavailableSkus=[];
 try{
  // The cloud only needs current NEW observations; it already retains pending
  // captures. Bound each payload as departments and retailers grow.
  const observations=snapshot.products.filter(p=>p.newStatus&&isPublishedProduct(p)&&christmasEligibility(p,offeredObject(p)).disposition==='include').map(p=>({sku:p.sku,taxonomyAudit:p.taxonomyAudit,sourceUrl:p.sourceUrl,newStatus:p.newStatus,kind:p.kind,department:p.department,departmentIds:p.departmentIds,variantName:p.variantName,priceGBP:p.priceGBP,originalPrice:p.originalPrice,promoText:p.promoText,variantImageUrl:p.variantImageUrl,imageUrl:p.imageUrl}));
  let plan;for(let offset=0;offset<Math.max(observations.length,1);offset+=500)plan=await controlCall('/internal/monitor-plan',{lease,products:observations.slice(offset,offset+500)});
  const current=new Map(snapshot.products.map(p=>[p.sku,p]));
  const pending=plan.candidates.map(p=>current.get(p.sku)).filter(p=>p&&isPublishedProduct(p)&&christmasEligibility(p,offeredObject(p)).disposition==='include'),reuse=p=>Boolean(reader.captureVerified&&deferDelivery&&reusableNewDetails(p,policy,now())),needDetails=pending.filter(p=>!reuse(p));if(pending.length&&policy.nativeCaptureEnabled!==false)try{await reader.prepareNativeCapture?.()}catch(e){console.error(JSON.stringify({phase:'native-NEW-capture-start',error:String(e.message).slice(0,180)}));}if(needDetails.length)try{await reader.prepareFamilies?.(needDetails)}catch(e){console.error(JSON.stringify({phase:'NEW-family-preparation',error:String(e.message).slice(0,250)}));}
  if(needDetails.length)await reader.repairFamilies?.(needDetails);
  for(const candidate of plan.candidates){
   const p=current.get(candidate.sku),key=p&&productKey(p,policy)+':screenshot',failure=key&&state.failures[key];
   if(!p||!isPublishedProduct(p)||christmasEligibility(p,offeredObject(p)).disposition!=='include'){unavailableSkus.push(candidate.sku);continue;}
   const savedDetails=reuse(p)||Boolean(reader.captureVerified&&deferDelivery&&reader.familyReady?.(p.sourceUrl));
   if(attempted>=policy.maxScreenshotPagesPerRun||budget.remaining()<1&&!savedDetails||!policy.retryPendingNow&&failure?.fingerprint===detailFingerprint(p)&&Date.parse(failure.retryAt)>now()){deferred++;continue;}
   if(/[\u0000-\u001f]/.test(p.sourceUrl)){deferred++;continue;}
   attempted++;
   try{
    const options={formats:reader.captureVerified&&deferDelivery?['rawHtml','markdown']:['rawHtml','markdown',{type:'screenshot',fullPage:true,quality:75,viewport:{width:1920,height:1080}}],waitFor:2000,purpose:'screenshot'};let capture={data:{}},detail;
    if(reuse(p)){detail={specs:p.specifications||{},observedAt:p.attributeObservedAt};console.log(JSON.stringify({phase:'reuse-verified-NEW-details',sku:p.sku,sourceObservedAt:p.attributeObservedAt,firecrawlCredits:0}));}
    else{try{capture=await reader.raw(p.sourceUrl,options)}catch(e){if(!reader.repairFamily||e.status===404||e.budgetLimited)throw e;await reader.repairFamily(p.sourceUrl,{preferredThumbnail:p.variantImageUrl});capture=await reader.raw(p.sourceUrl,options);}
     detail=parseDetails(capture,p.sku,p.sourceUrl);applyDetails(p,detail);p.sourceDescription=detail.featuresText;p.detailsReady=true;cacheProduct(p,state,policy);await saveState(state,dir);}
    const screenshot=capture.data?.screenshotBase64;if(!screenshot&&!(reader.captureVerified&&deferDelivery))throw Error('该SKU原站截图未生成，等待浏览器重试');
    const bytes=Buffer.from(screenshot||'','base64');if(bytes.length>5000000)throw Error('截图超过邮件限制');
    const info=productInformation(p,detail.specs);
    const event={lease,product:{...candidate,...p,newStatus:candidate.newStatus,description:info.summary,specifications:info.specifications},screenshotBase64:bytes.toString('base64'),screenshotVerifiedAt:detail.observedAt};if(deferDelivery)events.push(event);else await controlCall('/internal/event',event);
    delete state.failures[key];captured++;
   }catch(e){
    if(e.budgetLimited){deferred++;continue;}
    const failure=failedAttempt(p,e.message,state.failures,policy,now(),':screenshot');issues.push({sku:p.sku,status:e.status||0,reason:String(e.message).slice(0,250),retryAt:failure.retryAt});
    if([401,402,429].includes(e.status)){deferred+=plan.candidates.length-attempted;break;}
   }
  }
  if(deferDelivery)return {success:issues.length===0&&deferred===0,attempted,captured,deferred,issues,unavailableSkus,scanned:snapshot.products.length,events};
  const delivery=await deliverVerifiedEvents(controlCall);
  await controlCall('/internal/monitor-complete',{lease,success:true,scanned:snapshot.products.length,newCount:captured,unavailableSkus});
  await saveState(state,dir);
  return {success:true,attempted,captured,deferred,issues,scanned:snapshot.products.length};
 }catch(e){
  const error=String(e.message).replace(/fc-[\w-]+/g,'[redacted]').slice(0,250);
  console.error(JSON.stringify({phase:'NEW-event-processing',error}));
  if(!deferDelivery)await controlCall('/internal/monitor-complete',{lease,success:false,error:'本轮新品处理未完成，已保留待处理记录',scanned:snapshot.products.length,newCount:captured}).catch(()=>{});
  await saveState(state,dir);return {success:false,attempted,captured,deferred,issues,error,events,unavailableSkus,scanned:snapshot.products.length};
 }
}

export function mergeVerifiedEventProduct(eventProduct,current){
 const merged={...eventProduct,...current,description:eventProduct.mailAssets?eventProduct.description:(current.productSummary||eventProduct.description)};
 const proof=eventProduct.verifiedNotificationImage;
 if(proof&&String(proof.sku)===String(current.sku)&&proof.sourceUrl===current.sourceUrl&&proof.variantImageUrl===(current.variantImageUrl||current.imageUrl)&&(!current.originalImageUrl||proof.originalImageUrl===current.originalImageUrl)){
  merged.originalImageUrl=proof.originalImageUrl;merged.originalCachedImageUrl=proof.originalCachedImageUrl;merged.originalImageEvidence=proof.originalImageEvidence;
 }else if(proof){delete merged.originalCachedImageUrl;delete merged.mailAssets;delete merged.verifiedNotificationImage;}
 return merged;
}

export async function finishNewEvents(result,{snapshot,lease,controlCall=control,buildAssets=buildMailAssets,publishCheckpoint=publishCollectionCheckpoint,sourceObservedAt=snapshot?.observedAt}={}){
 // Reclassification is not a new-product event. Suppress out-of-scope or
 // unresolved products before persisting any mail, retaining the global SKU
 // history in the cloud so category changes cannot cause duplicate sends.
 const allowed=new Map(snapshot.products.filter(p=>isPublishedProduct(p)&&christmasEligibility(p,offeredObject(p)).disposition==='include').map(p=>[p.sku,p]));
 const removed=(result.events||[]).filter(e=>!allowed.has(e.product.sku));
 result.events=(result.events||[]).filter(e=>allowed.has(e.product.sku));
 result.unavailableSkus=[...new Set([...(result.unavailableSkus||[]),...removed.map(e=>e.product.sku)])];result.captured=result.events.length;

 // Persist verified events in the private cloud queue before Pages publication.
 // A runner or deploy failure must not lose a paid capture or require another scrape.
 const ready=[];
 for(const event of result.events||[]){
  try{const p=allowed.get(event.product.sku);event.product=mergeVerifiedEventProduct(event.product,p);
   if(!event.product.mailAssets){const cardOnly=event.product.notificationEvidenceMode==='verified-information-card';const assets=await buildAssets(event.product,event.screenshotBase64,{verifiedCardOnly:cardOnly});event.screenshotBase64=assets.attachmentBase64;event.product.description=(event.product.productSummary||event.product.description||'')+(cardOnly?'。附件为具体SKU核验后的完整商品信息卡与官网原图。':'。附件前半为完整商品信息卡，后半为同一SKU原站真实截图。')+'保存完整信息卡与官网原图：'+assets.downloadUrl;event.product.screenshotKind=assets.attachmentKind;}
  }catch(e){result.issues||=[];result.issues.push({sku:event.product.sku,status:e.status||0,reason:'新品附件待核验 · NEW attachments pending',error:String(e.message).slice(0,250)});result.deferred=(result.deferred||0)+1;result.success=false;continue;}
  // Collect ready products before publishing and then queueing their files.
  ready.push(event);
 }
 // Files are durable before a SKU is marked seen. A queued email is pinned
 // to that exact commit, independently of Pages or later product updates.
 const publication=ready.length&&publishCheckpoint?await publishCheckpoint({stage:'new-assets'}):null;
 if(publication?.published)for(const event of ready)event.product.mailAssets=pinMailAssets(event.product.mailAssets,publication.revision);
 const identity=e=>(e.product.retailerId||'the-range')+':'+e.product.sku,queued=new Set(result.queuedSkus||[]);
 if(result.queuePersisted)for(const event of ready)queued.add(identity(event));
 for(const event of ready){
  if(queued.has(identity(event)))continue;
  try{
   const request=event.product.mailAssets?.publishedRevision?{...event,notificationTransport:NOTIFICATION_CONTRACT,screenshotBase64:undefined}:event;
   const receipt=await controlCall('/internal/event',request);if(!receipt.recorded&&!receipt.alreadyRecorded)throw Error('Cloud did not acknowledge the NEW event');
   queued.add(identity(event));
  }catch(e){result.success=false;result.deferred=(result.deferred||0)+1;result.issues||=[];result.issues.push({sku:event.product.sku,status:e.status||0,reason:'新品入队待恢复 · NEW queue pending',error:String(e.message).slice(0,250)});}
 }
 result.events=ready;result.queuedSkus=[...queued];result.captured=ready.filter(e=>queued.has(identity(e))).length;result.queuePersisted=result.captured===ready.length;
 if(!result.monitorCompleted){await controlCall('/internal/monitor-complete',{lease,success:result.success,catalogueReady:true,sourceObservedAt,evidenceRetryable:!result.success&&retryableEvidence(result),error:result.success?undefined:'部分新品资料未通过核验，已隔离并安排对应阶段恢复',scanned:result.scanned,newCount:result.captured,unavailableSkus:result.unavailableSkus||[]});result.monitorCompleted=true;}
 if(process.env.GITHUB_ACTIONS==='true'&&process.env.NOTIFICATION_PHASE!=='deliver'){
  let delivery;if(publication?.published)try{delivery=await deliverVerifiedEvents(controlCall)}catch(e){delivery={pending:true,error:String(e.message).slice(0,160)};}
  await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/notification-outbox.private.json',JSON.stringify({result,snapshot:{products:(result.events||[]).map(e=>e.product)},lease}));const {events,...summary}=result;return {...summary,delivery,deliveryPending:delivery?Boolean(delivery.pending||delivery.pendingDeliveries):(result.events||[]).length>0};
 }
 const delivery=await deliverVerifiedEvents(controlCall);
 const {events,...publicResult}=result;return {...publicResult,delivery};
}

export async function captureNewScreenshots(result,{reader,state,policy,now=()=>Date.now()}={}){
 if(!reader.captureVerified)return result;
 const verified=[];
 const events=result.events||[];let cursor=0;const captureOne=async event=>{try{
  const p=event.product,dir='web/mail-assets/'+p.sku,fingerprint=JSON.stringify([p.sku,p.sourceUrl,p.variantImageUrl,p.priceGBP,p.descriptionHash]),saved=await fs.readFile(dir+'/capture.json','utf8').then(JSON.parse).catch(()=>null);let reused=false;
  const visibleBrowserProof=saved?.verifiedBy==='normal-browser-visible-SKU'&&saved.selectedMainVerified===true&&saved.sku===p.sku&&saved.sourceUrl===p.sourceUrl&&saved.priceGBP===p.priceGBP&&saved.variantImageUrl===p.variantImageUrl&&saved.visibleSku===p.sku&&saved.originalImageUrl;
  const mappedBrowserProof=saved?.verifiedBy==='normal-browser-exact-SKU-gallery'&&saved.galleryMappingVerified===true&&saved.sku===p.sku&&saved.sourceUrl===p.sourceUrl&&saved.priceGBP===p.priceGBP&&saved.variantImageUrl===p.variantImageUrl&&saved.visibleSku===p.sku&&saved.originalImageUrl===p.originalImageUrl&&p.originalImages?.some(g=>g.url===saved.originalImageUrl&&String(g.variantId)===String(saved.variantId));
  // checkNew has just verified the current SKU details. If every captured
  // input still matches, reuse the exact paid proof bytes regardless of age;
  // retain their real timestamp, and verify original image bytes separately.
  if(saved?.fingerprint===fingerprint||(visibleBrowserProof||mappedBrowserProof)&&now()-Date.parse(saved.capturedAt)<86400000){try{const file=['proof-browser.jpg','proof-source.bin'].includes(saved.file)?saved.file:'proof.png',bytes=await fs.readFile(dir+'/'+file);if(createHash('sha256').update(bytes).digest('hex')===saved.sha256){event.screenshotBase64=bytes.toString('base64');p.originalImageUrl=saved.originalImageUrl;event.screenshotVerifiedAt=saved.capturedAt;reused=true;}}catch{}}
  if(!reused&&policy.preferVerifiedProductCard&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku)&&p.attributeObservedAt&&p.originalImageUrl&&p.originalImages?.some(g=>g.url===p.originalImageUrl&&(g.variantId!=null&&p.variantId!=null&&String(g.variantId)===String(p.variantId)||p.originalSourceEvidence?.selectedSku===String(p.sku)&&p.originalSourceEvidence?.sourceUrl===p.sourceUrl))){event.screenshotBase64=null;p.notificationEvidenceMode='verified-information-card';verified.push(event);console.log(JSON.stringify({phase:'NEW-verified-product-card',sku:p.sku,pageScreenshotRequests:0,originalAuditRequired:true}));return;}
  if(!reused){event.screenshotBase64=await reader.captureVerified(p.sourceUrl,{preferredThumbnail:p.variantImageUrl});const original=reader.originalsFor?.(p.sourceUrl)?.[0];if(original)p.originalImageUrl=original.url;const bytes=Buffer.from(event.screenshotBase64,'base64');await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'/proof-source.bin',bytes);await atomicJson(dir+'/capture.json',{version:1,file:'proof-source.bin',sku:p.sku,sourceUrl:p.sourceUrl,fingerprint,capturedAt:new Date(now()).toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),originalImageUrl:p.originalImageUrl,product:p});}
  verified.push(event);console.log(JSON.stringify({phase:'NEW-screenshot-checkpoint',sku:p.sku,completed:verified.length,total:result.events.length,reused,firecrawlCreditsReused:reused?0:undefined}));
 }catch(e){const p=event.product;if(policy.allowVerifiedCardWithoutScreenshot&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku)&&p.attributeObservedAt&&p.originalImageUrl){
   // The original-photo audit and card builder still enforce selected-SKU
   // gallery provenance and actual downloaded bytes. This is never labelled
   // as a retailer screenshot, and a missing original remains a hard failure.
   event.screenshotBase64=null;p.notificationEvidenceMode='verified-information-card';p.sourceScreenshotIssue={reason:String(e.message).slice(0,200),observedAt:new Date(now()).toISOString()};verified.push(event);result.optionalEvidenceIssues||=[];result.optionalEvidenceIssues.push({sku:p.sku,kind:'source-page-screenshot',reason:p.sourceScreenshotIssue.reason});delete state.failures[productKey(p,policy)+':screenshot'];console.log(JSON.stringify({phase:'NEW-verified-card-evidence',sku:p.sku,sourceScreenshotAvailable:false,originalAuditRequired:true}));
  }else{const failure=failedAttempt(p,e.message,state.failures,policy,now(),':screenshot');result.issues.push({sku:p.sku,status:e.status||0,reason:String(e.message).slice(0,200),retryAt:failure.retryAt});result.success=false;result.deferred++;}}};
 await Promise.all(Array.from({length:Math.min(2,events.length)},async()=>{while(cursor<events.length)await captureOne(events[cursor++]);}));
 result.events=verified;result.captured=verified.length;return result;
}

export function retainVerifiedNewImages(result,snapshot,audit){
 const entries=audit?.entries||{},failures=audit?.failures||[],passed=[];
 for(const event of result.events||[]){const p=snapshot.products.find(p=>p.sku===event.product.sku),main=p&&(p.variantImageUrl||p.imageUrl),urls=p?[main,p.originalImageUrl]:[],bad=urls.find(url=>!url||!entries[url]?.ok);
  if(p&&urls.length===2&&urls.every(url=>url&&entries[url]?.ok)&&p.originalCachedImageUrl){
   // Compact catalogue publication may replace this object before mail cards
   // are rendered. Retain exact-SKU original evidence on the durable event.
   event.product={...event.product,variantImageUrl:main,originalImageUrl:p.originalImageUrl,originalCachedImageUrl:p.originalCachedImageUrl,originalImageEvidence:p.originalImageEvidence,verifiedNotificationImage:{sku:p.sku,sourceUrl:p.sourceUrl,variantImageUrl:main,originalImageUrl:p.originalImageUrl,originalCachedImageUrl:p.originalCachedImageUrl,originalImageEvidence:p.originalImageEvidence}};
   passed.push(event);continue;}
  const detail=failures.find(f=>f.url===bad);result.issues.push({sku:event.product.sku,reason:'原图待核验 · Original image pending',url:bad||p?.originalImageUrl||null,imageError:detail?.error||'Original photo evidence unavailable',status:detail?.status||null});result.deferred++;result.success=false;
 }
 result.events=passed;result.captured=passed.length;return result;
}
