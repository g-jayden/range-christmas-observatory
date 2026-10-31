import fs from 'node:fs/promises';
import {categories,collectStableCategory,mergeSnapshot,atomicJson} from './sync.mjs';
import {digest,productKey,detailFingerprint,verified,seedFailures,planDetails,failedAttempt,imageMapFingerprint} from './collection-policy.mjs';
import {parseDetails,applyDetails} from './details.mjs';
const detailFields=['heightLabel','heightCm','heightValues','treeColor','colorValues','material','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm','specifications','style','features','detailEvidence','attributeObservedAt','images','descriptionHash','productSummary','detailInputFingerprint','detailStatus','detailCheckedAt'];
export async function readState(dir='runtime/collection'){
 let state;try{state=JSON.parse(await fs.readFile(dir+'/details.json','utf8'))}catch{state={version:1,details:{},failures:{}}}
 state.details||={};state.failures||={};return state;
}
let stateWrites=Promise.resolve();
export async function saveState(state,dir='runtime/collection'){const copy=structuredClone(state);stateWrites=stateWrites.then(()=>atomicJson(dir+'/details.json',copy));await stateWrites}
export function cacheProduct(p,state,policy){
 p.detailInputFingerprint=detailFingerprint(p);p.detailStatus='具体SKU规格已核验';
 state.completed||=[];if(!state.completed.includes(productKey(p,policy)))state.completed.push(productKey(p,policy));
 state.details[productKey(p,policy)]={fingerprint:p.detailInputFingerprint,observedAt:p.attributeObservedAt,values:Object.fromEntries(detailFields.map(k=>[k,p[k]]))};
 delete state.failures[productKey(p,policy)];
}
export function restoreProducts(snapshot,state,policy){
 let restored=0;
 for(const p of snapshot.products){const saved=state.details[productKey(p,policy)];if(saved?.fingerprint===detailFingerprint(p)&&verified({...p,...saved.values})&&(!verified(p)||Date.parse(saved.observedAt)>Date.parse(p.attributeObservedAt))){Object.assign(p,structuredClone(saved.values));restored++}}
 return restored;
}
export async function catalogueSnapshot({previous,reader,policy,dir='runtime/collection',now=()=>Date.now(),onProgress=()=>{},forceFresh=false}){
 const scope=digest({retailer:policy.retailerId,catalogue:policy.catalogueId,categories,filters:{in_stock_f:['true']},version:1});let cached;
 try{cached=JSON.parse(await fs.readFile(dir+'/catalogue.json','utf8'))}catch{}
 const observed=Date.parse(cached?.observedAt),age=now()-observed;
 if(!forceFresh&&cached?.scope===scope&&age>=0&&age<=policy.catalogueReuseHours*3600000&&observed>Date.parse(previous.observedAt||0)){
  try{const snapshot=mergeSnapshot(previous,cached.collected,cached.observedAt);return {snapshot,reused:true,observedAt:cached.observedAt}}catch{}
 }
 const collected={};for(const [category,id]of Object.entries(categories)){onProgress(category);collected[category]=await collectStableCategory(id,reader)}
 const observedAt=new Date(now()).toISOString(),snapshot=mergeSnapshot(previous,collected,observedAt);
 await atomicJson(dir+'/catalogue.json',{scope,observedAt,collected});
 return {snapshot,reused:false,observedAt};
}
export async function refreshDetails({previous,snapshot,reader,policy,budget,state,dir='runtime/collection',now=()=>Date.now(),enabled=true}){
 seedFailures(previous,state.failures,policy);const restored=restoreProducts(snapshot,state,policy);
 const plan=planDetails(previous,snapshot,{policy,failures:state.failures,now:now(),completed:new Set(state.completed||[]),limit:enabled?Math.min(policy.maxDetailPagesPerRun,Math.floor(budget.remaining())):0});
 let cursor=0,checked=0,succeeded=0,halt=false;const failures=[];
 await Promise.all(Array.from({length:Math.min(4,plan.selected.length)},async()=>{
  while(cursor<plan.selected.length&&!halt){const item=plan.selected[cursor++],p=item.product;
   if(budget.remaining()<1){halt=true;break}
   try{
    const response=await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown'],waitFor:1500,purpose:'detail'});
    const detail=parseDetails(response,p.sku,p.sourceUrl);applyDetails(p,detail);p.detailCheckedAt=detail.observedAt;cacheProduct(p,state,policy);succeeded++;
   }catch(e){
    if(e.budgetLimited){halt=true;continue}
    const failure=failedAttempt(p,e.message,state.failures,policy,now());failures.push({sku:p.sku,url:p.sourceUrl,reason:e.message,retryAt:failure.retryAt});
    p.detailStatus=verified(p)?'沿用有日期的既有规格，本次重查未通过':'详情核验未通过，已延后重试';p.detailCheckedAt=new Date(now()).toISOString();
    if([401,402,429].includes(e.status))halt=true;
   }
   checked++;await saveState(state,dir);
  }
 }));
 await saveState(state,dir);
 const issues=[...failures,...plan.invalid,...plan.backoff.map(x=>({sku:x.sku,reason:x.reason,retryAt:x.retryAt}))];
 return {mode:'incremental',checked,succeeded,verified:snapshot.products.filter(verified).length,reused:plan.reused.length,restored,queued:plan.eligible,deferred:plan.deferred.length+Math.max(0,plan.selected.length-checked),backoff:plan.backoff.length,invalid:plan.invalid.length,maxAgeDays:policy.detailMaxAgeDays,limit:policy.maxDetailPagesPerRun,issues,completedAt:new Date(now()).toISOString()};
}
export function preserveImages(previous,next){
 const old=new Map(previous.products.map(p=>[p.sku,p]));let changed=0;
 for(const p of next.products){const before=old.get(p.sku),same=before&&(before.variantImageUrl||before.imageUrl)===(p.variantImageUrl||p.imageUrl);
  if(!same){changed++;delete p.cachedImageUrl;p.imageStatus='图片地址已更新，浏览器直接加载原站照片'}else{p.imageStatus=before.imageStatus||'沿用原站照片地址';if(before.cachedImageUrl)p.cachedImageUrl=before.cachedImageUrl}
 }
 return {mode:'source-addresses-and-cache',changed,unchanged:next.products.length-changed,paidImageRequests:0,imageMapFingerprint:imageMapFingerprint(next.products)};
}
