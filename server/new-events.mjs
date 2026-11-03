import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {atomicJson} from './sync.mjs';
import {buildMailAssets} from './mail-assets.mjs';
import {parseDetails,applyDetails,productInformation} from './details.mjs';
import {control} from './cloud-client.mjs';
import {productKey,detailFingerprint,failedAttempt} from './collection-policy.mjs';
import {cacheProduct,saveState} from './incremental.mjs';
export async function deliverVerifiedEvents(controlCall=control){let delivery,accepted=0;for(let batch=0;batch<100;batch++){delivery=await controlCall('/internal/deliver',{});accepted+=Number(delivery.accepted||0);if(!delivery.morePending)return {...delivery,accepted};}throw Error('仍有待发邮件，已保留云端队列');}
export async function checkNew({snapshot,reader,policy,budget,state,lease,dir='runtime/collection',controlCall=control,fetcher=fetch,now=()=>Date.now(),deferDelivery=false}){
 let captured=0,attempted=0,deferred=0;const issues=[],events=[];
 try{
  // The cloud only needs current NEW observations; it already retains pending
  // captures. Bound each payload as departments and retailers grow.
  const observations=snapshot.products.filter(p=>p.newStatus).map(p=>({sku:p.sku,sourceUrl:p.sourceUrl,newStatus:p.newStatus,kind:p.kind,department:p.department,departmentIds:p.departmentIds,variantName:p.variantName,priceGBP:p.priceGBP,variantImageUrl:p.variantImageUrl,imageUrl:p.imageUrl}));
  let plan;for(let offset=0;offset<Math.max(observations.length,1);offset+=500)plan=await controlCall('/internal/monitor-plan',{lease,products:observations.slice(offset,offset+500)});
  const current=new Map(snapshot.products.map(p=>[p.sku,p]));
  const pending=plan.candidates.map(p=>current.get(p.sku)).filter(Boolean);if(pending.length)await reader.prepareFamilies?.(pending);
  for(const candidate of plan.candidates){
   const p=current.get(candidate.sku),key=p&&productKey(p,policy)+':screenshot',failure=key&&state.failures[key];
   if(!p||attempted>=policy.maxScreenshotPagesPerRun||budget.remaining()<1||failure?.fingerprint===detailFingerprint(p)&&Date.parse(failure.retryAt)>now()){deferred++;continue;}
   if(/[\u0000-\u001f]/.test(p.sourceUrl)){deferred++;continue;}
   attempted++;
   try{
    const capture=await reader.raw(p.sourceUrl,{formats:reader.captureVerified&&deferDelivery?['rawHtml','markdown']:['rawHtml','markdown',{type:'screenshot',fullPage:true,quality:75,viewport:{width:1920,height:1080}}],waitFor:2000,purpose:'screenshot'});
    const detail=parseDetails(capture,p.sku,p.sourceUrl);applyDetails(p,detail);cacheProduct(p,state,policy);await saveState(state,dir);
    const screenshot=capture.data?.screenshotBase64;if(!screenshot&&!(reader.captureVerified&&deferDelivery))throw Error('该SKU原站截图未生成，等待浏览器重试');
    const bytes=Buffer.from(screenshot||'','base64');if(bytes.length>5000000)throw Error('截图超过邮件限制');
    const info=productInformation(p,detail.specs);
    const event={lease,product:{...candidate,...p,newStatus:candidate.newStatus,description:info.summary,specifications:info.specifications},screenshotBase64:bytes.toString('base64'),screenshotVerifiedAt:detail.observedAt};if(deferDelivery)events.push(event);else await controlCall('/internal/event',event);
    delete state.failures[key];captured++;
   }catch(e){
    if(e.budgetLimited){deferred++;continue;}
    const failure=failedAttempt(p,e.message,state.failures,policy,now(),':screenshot');issues.push({sku:p.sku,reason:String(e.message).slice(0,250),retryAt:failure.retryAt});
    if([401,402,429].includes(e.status)){deferred+=plan.candidates.length-attempted;break;}
   }
  }
  if(deferDelivery)return {success:issues.length===0&&deferred===0,attempted,captured,deferred,issues,scanned:snapshot.products.length,events};
  const delivery=await deliverVerifiedEvents(controlCall);
  await controlCall('/internal/monitor-complete',{lease,success:true,scanned:snapshot.products.length,newCount:captured});
  await saveState(state,dir);
  return {success:true,attempted,captured,deferred,issues,scanned:snapshot.products.length};
 }catch(e){
  const error=String(e.message).replace(/fc-[\w-]+/g,'[redacted]').slice(0,250);
  await controlCall('/internal/monitor-complete',{lease,success:false,error:'本轮新品处理未完成，已保留待处理记录',scanned:snapshot.products.length,newCount:captured}).catch(()=>{});
  await saveState(state,dir);return {success:false,attempted,captured,deferred,issues,error};
 }
}

export async function finishNewEvents(result,{snapshot,lease,controlCall=control}={}){
 for(const event of result.events||[]){const p=snapshot.products.find(p=>p.sku===event.product.sku);if(p)event.product={...event.product,...p,description:event.product.mailAssets?event.product.description:(p.productSummary||event.product.description)};if(!event.product.mailAssets){const assets=await buildMailAssets(event.product,event.screenshotBase64);event.screenshotBase64=assets.attachmentBase64;event.product.description=(event.product.productSummary||event.product.description||'')+'。附件前半为完整商品信息卡，后半为同一SKU原站真实截图。保存完整信息卡与官网原图：'+assets.downloadUrl;event.product.screenshotKind=assets.attachmentKind;}}
 // Persist verified events in the private cloud queue before Pages publication.
 // A runner or deploy failure must not lose a paid capture or require another scrape.
 if(!result.queuePersisted){for(const event of result.events||[])await controlCall('/internal/event',event);result.queuePersisted=true;}
 if(!result.monitorCompleted){await controlCall('/internal/monitor-complete',{lease,success:result.success,error:result.success?undefined:'部分新品截图或详情未通过核验',scanned:result.scanned,newCount:result.captured});result.monitorCompleted=true;}
 if(process.env.GITHUB_ACTIONS==='true'&&process.env.NOTIFICATION_PHASE!=='deliver'){await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/notification-outbox.private.json',JSON.stringify({result,snapshot:{products:(result.events||[]).map(e=>e.product)},lease}));const {events,...summary}=result;return {...summary,deliveryPending:(result.events||[]).length>0};}
 const delivery=await deliverVerifiedEvents(controlCall);
 const {events,...publicResult}=result;return {...publicResult,delivery};
}

export async function captureNewScreenshots(result,{reader,state,policy,now=()=>Date.now()}={}){
 if(!reader.captureVerified)return result;
 const verified=[];
 for(const event of result.events||[])try{
  const p=event.product,dir='web/mail-assets/'+p.sku,fingerprint=JSON.stringify([p.sku,p.sourceUrl,p.variantImageUrl,p.priceGBP,p.descriptionHash]),saved=await fs.readFile(dir+'/capture.json','utf8').then(JSON.parse).catch(()=>null);let reused=false;
  const visibleBrowserProof=saved?.verifiedBy==='normal-browser-visible-SKU'&&saved.sku===p.sku&&saved.sourceUrl===p.sourceUrl&&saved.priceGBP===p.priceGBP&&saved.variantImageUrl===p.variantImageUrl&&saved.visibleSku===p.sku&&saved.originalImageUrl;
  if((saved?.fingerprint===fingerprint||visibleBrowserProof)&&now()-Date.parse(saved.capturedAt)<86400000){try{const file=['proof-browser.jpg','proof-source.bin'].includes(saved.file)?saved.file:'proof.png',bytes=await fs.readFile(dir+'/'+file);if(createHash('sha256').update(bytes).digest('hex')===saved.sha256){event.screenshotBase64=bytes.toString('base64');p.originalImageUrl=saved.originalImageUrl;event.screenshotVerifiedAt=saved.capturedAt;reused=true;}}catch{}}
  if(!reused){event.screenshotBase64=await reader.captureVerified(p.sourceUrl,{preferredThumbnail:p.variantImageUrl});const original=reader.originalsFor?.(p.sourceUrl)?.[0];if(original)p.originalImageUrl=original.url;const bytes=Buffer.from(event.screenshotBase64,'base64');await fs.mkdir(dir,{recursive:true});await fs.writeFile(dir+'/proof-source.bin',bytes);await atomicJson(dir+'/capture.json',{version:1,file:'proof-source.bin',sku:p.sku,sourceUrl:p.sourceUrl,fingerprint,capturedAt:new Date(now()).toISOString(),sha256:createHash('sha256').update(bytes).digest('hex'),originalImageUrl:p.originalImageUrl,product:p});}
  verified.push(event);console.log(JSON.stringify({phase:'NEW-screenshot-checkpoint',sku:p.sku,completed:verified.length,total:result.events.length,reused,firecrawlCreditsReused:reused?0:undefined}));
 }catch(e){const failure=failedAttempt(event.product,e.message,state.failures,policy,now(),':screenshot');result.issues.push({sku:event.product.sku,reason:String(e.message).slice(0,200),retryAt:failure.retryAt});result.success=false;result.deferred++;}
 result.events=verified;result.captured=verified.length;return result;
}

export function retainVerifiedNewImages(result,snapshot,audit){
 const entries=audit?.entries||{},failures=audit?.failures||[],passed=[];
 for(const event of result.events||[]){const p=snapshot.products.find(p=>p.sku===event.product.sku),main=p&&(p.variantImageUrl||p.imageUrl),urls=p?[main,p.originalImageUrl]:[],bad=urls.find(url=>!url||!entries[url]?.ok);
  if(p&&urls.length===2&&urls.every(url=>url&&entries[url]?.ok)&&p.originalCachedImageUrl){passed.push(event);continue;}
  const detail=failures.find(f=>f.url===bad);result.issues.push({sku:event.product.sku,reason:'原图待核验 · Original image pending',url:bad||p?.originalImageUrl||null,imageError:detail?.error||'Original photo evidence unavailable',status:detail?.status||null});result.deferred++;result.success=false;
 }
 result.events=passed;result.captured=passed.length;return result;
}
