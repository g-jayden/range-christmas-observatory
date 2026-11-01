import fs from 'node:fs/promises';
import {categories,collectStableCategory,mergeSnapshot,atomicJson} from './sync.mjs';
import {digest,productKey,detailFingerprint,verified,seedFailures,planDetails,failedAttempt,imageMapFingerprint} from './collection-policy.mjs';
import {parseDetails,applyDetails} from './details.mjs';
const detailFields=['appearanceSource','sourceColour','sourceMaterial','heightLabel','heightCm','heightValues','treeColor','colorValues','material','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm','specifications','style','features','detailEvidence','attributeObservedAt','images','descriptionHash','productSummary','detailInputFingerprint','detailStatus','detailCheckedAt'];
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
export async function catalogueSnapshot({previous,reader,policy,dir='runtime/collection',now=()=>Date.now(),onProgress=()=>{},forceFresh=false,onSessionReady=async()=>{}}){
 const arrivals=await fs.readFile('web/new-arrivals.json','utf8').then(JSON.parse).catch(()=>({history:[]}));const history={...(previous.firstObservedHistory||{}),...Object.fromEntries((arrivals.history||[]).map(p=>[p.sku,p]))};previous={...previous,firstObservedHistory:history,products:previous.products.map(p=>history[p.sku]?.firstNewObservedAt?{...p,...history[p.sku]}:p)};
 const scope=digest({retailer:policy.retailerId,catalogue:policy.catalogueId,categories,filters:{in_stock_f:['true']},version:1});let cached;
 try{cached=JSON.parse(await fs.readFile(dir+'/catalogue.json','utf8'))}catch{}
 const observed=Date.parse(cached?.observedAt),age=now()-observed;
 if(!forceFresh&&cached?.scope===scope&&age>=0&&age<=policy.catalogueReuseHours*3600000&&observed>Date.parse(previous.observedAt||0)){
  try{const snapshot=mergeSnapshot(previous,cached.collected,cached.observedAt);return {snapshot,reused:true,observedAt:cached.observedAt}}catch{}
 }
 const ordered=Object.entries(categories).sort(([a],[b])=>a==='pop-up-trees'?-1:b==='pop-up-trees'?1:0);
 const collected={};for(const [category,id]of ordered){onProgress(category);collected[category]=await collectStableCategory(id,reader);onProgress(category+' '+collected[category].products.length+' SKU已核对');if(category==='pop-up-trees')await onSessionReady(collected[category].products)}
 const observedAt=new Date(now()).toISOString(),snapshot=mergeSnapshot(previous,collected,observedAt);
 await atomicJson(dir+'/catalogue.json',{scope,observedAt,collected});
 return {snapshot,reused:false,observedAt};
}
export async function refreshDetails({previous,snapshot,reader,policy,budget,state,dir='runtime/collection',now=()=>Date.now(),enabled=true}){
 seedFailures(previous,state.failures,policy);const restored=restoreProducts(snapshot,state,policy);
 const plan=planDetails(previous,snapshot,{policy,failures:state.failures,now:now(),completed:new Set(state.completed||[]),attempted:state.attempted||{},limit:enabled?policy.maxDetailPagesPerRun:0});
 let cursor=0,checked=0,succeeded=0,halt=false;const failures=[];
 const workers=await Promise.allSettled(Array.from({length:Math.min(4,plan.selected.length)},async()=>{
  while(cursor<plan.selected.length&&!halt){const item=plan.selected[cursor++],p=item.product;
   if(budget.remaining()<1){halt=true;break}
   state.attempted||={};state.attempted[item.key]=item.fingerprint;
   try{
    const response=await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown'],waitFor:1500,purpose:'detail'});
    const detail=parseDetails(response,p.sku,p.sourceUrl);applyDetails(p,detail);p.detailCheckedAt=detail.observedAt;cacheProduct(p,state,policy);succeeded++;
   }catch(e){
    if(e.budgetLimited){halt=true;continue}
    if([401,403].includes(e.status)){halt=true;throw e}
    const failure=failedAttempt(p,e.message,state.failures,policy,now());failures.push({sku:p.sku,url:p.sourceUrl,reason:e.message,retryAt:failure.retryAt});
    if(failures.length<=3)console.error(JSON.stringify({phase:'exact-SKU-failure',sku:p.sku,error:e.message}));
    delete state.details[item.key];
    if(verified(p))p.previousDetailEvidence={observedAt:p.attributeObservedAt,evidence:p.detailEvidence,specifications:p.specifications};
    p.attributeObservedAt=null;delete p.detailEvidence;delete p.specifications;delete p.productSummary;
    p.heightLabel='高度未确认';p.heightCm=null;p.heightValues=[];p.treeColor='颜色未确认';p.colorValues=[];p.material='材质未确认';p.skirtDiameterCm=null;p.skirtBaseDiameterCm=null;p.skirtTopDiameterCm=null;
    p.features={...(p.listingFeatures||{}),pinecones:null,berries:null,baubles:null};p.style=[['potted','圣诞树盆栽'],['popUp','折叠式圣诞树'],['slim','纤细圣诞树'],['snow','雪景款'],['prelit','预亮灯款']].find(([key])=>p.features[key])?.[1]||'标准／其他装饰待核验';
    p.detailStatus='本轮详情未通过核验，旧规格不计入当前统计';p.detailCheckedAt=new Date(now()).toISOString();
    if([401,402,429].includes(e.status))halt=true;
   }
   checked++;if(checked%25===0)await saveState(state,dir);
   if(checked%50===0||checked===plan.selected.length)console.log(JSON.stringify({phase:'exact-SKU-verification',checked,succeeded,queued:plan.selected.length}));
  }
 }));
 const rejected=workers.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;
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
