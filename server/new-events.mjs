import fs from 'node:fs/promises';
import {buildMailAssets} from './mail-assets.mjs';
import {parseDetails,applyDetails,productInformation} from './details.mjs';
import {control} from './cloud-client.mjs';
import {productKey,detailFingerprint,failedAttempt} from './collection-policy.mjs';
import {cacheProduct,saveState} from './incremental.mjs';
export async function checkNew({snapshot,reader,policy,budget,state,lease,dir='runtime/collection',controlCall=control,fetcher=fetch,now=()=>Date.now(),deferDelivery=false}){
 let captured=0,attempted=0,deferred=0;const issues=[],events=[];
 try{
  const plan=await controlCall('/internal/monitor-plan',{lease,products:snapshot.products.map(p=>({sku:p.sku,sourceUrl:p.sourceUrl,newStatus:p.newStatus,kind:p.kind,variantName:p.variantName,priceGBP:p.priceGBP,variantImageUrl:p.variantImageUrl,imageUrl:p.imageUrl}))});
  const current=new Map(snapshot.products.map(p=>[p.sku,p]));
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
  let delivery;do{delivery=await controlCall('/internal/deliver',{});}while(delivery.morePending);
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
 if(process.env.GITHUB_ACTIONS==='true'&&process.env.NOTIFICATION_PHASE!=='deliver'){await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/notification-outbox.private.json',JSON.stringify({result,snapshot:{products:(result.events||[]).map(e=>e.product)},lease}));const {events,...summary}=result;return {...summary,deliveryPending:true};}
 for(const event of result.events||[])await controlCall('/internal/event',event);
 let delivery;do{delivery=await controlCall('/internal/deliver',{});}while(delivery.morePending);
 await controlCall('/internal/monitor-complete',{lease,success:result.success,error:result.success?undefined:'部分新品截图或详情未通过核验，待下次每日任务处理',scanned:result.scanned,newCount:result.captured});
 const {events,...publicResult}=result;return {...publicResult,delivery};
}

export async function captureNewScreenshots(result,{reader,state,policy,now=()=>Date.now()}={}){
 if(!reader.captureVerified)return result;
 const verified=[];
 for(const event of result.events||[])try{
  event.screenshotBase64=await reader.captureVerified(event.product.sourceUrl,{preferredThumbnail:event.product.variantImageUrl});const original=reader.originalsFor?.(event.product.sourceUrl)?.[0];if(original)event.product.originalImageUrl=original.url;verified.push(event);
 }catch(e){const failure=failedAttempt(event.product,e.message,state.failures,policy,now(),':screenshot');result.issues.push({sku:event.product.sku,reason:String(e.message).slice(0,200),retryAt:failure.retryAt});result.success=false;result.deferred++;}
 result.events=verified;result.captured=verified.length;return result;
}
