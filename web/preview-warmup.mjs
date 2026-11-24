import {annotatedImage,nativeImage} from './native-image-browser.mjs';
import {productPreviewGallery} from './product-preview.mjs';
import {productKey,productPrice,productSize,nativeSourceUrl} from './product-facts.mjs';

// All visible products and every eligible gallery frame share this queue.
// User intent has a reserved slot; background downloads cannot block it.
// No collection or paid endpoint is reachable from this module.
export function createPreviewWarmer({prepare=annotatedImage,prepareNative=nativeImage,concurrency=2,urgentConcurrency=1}={}){
 const queue=[],pending=new Map();let background=0,urgent=0,preferred='';
 const sort=()=>queue.sort((a,b)=>Number(b.rank===2)-Number(a.rank===2)||(preferred?Number(productKey(b.p)===preferred)-Number(productKey(a.p)===preferred):0)||b.rank-a.rank);
 function drain(){for(let i=0;i<queue.length;){const job=queue[i],interactive=job.rank===2;
  if(interactive?urgent>=urgentConcurrency:background>=concurrency){i++;continue;}
  queue.splice(i,1);job.started=true;interactive?urgent++:background++;
  Promise.resolve().then(()=>job.native?prepareNative(job.p,job.item):prepare(job.p,job.item)).then(job.resolve,job.reject).finally(()=>{interactive?urgent--:background--;if(pending.get(job.key)===job)pending.delete(job.key);drain();});
 }}
 function warmItem(p,item,{priority=false,native=false}={}){
  if(p.sourceImageConflict||p.browseDetailsPending||!item)return Promise.resolve(null);
  const key=JSON.stringify([native?'native':'annotated',productKey(p),nativeSourceUrl(p,item),p.originalImageEvidence,item,p.observedAt,productPrice(p),productSize(p)]),rank=priority?2:native?0:1;
  const prior=pending.get(key);if(prior){if(!prior.started&&rank>prior.rank){prior.rank=rank;sort();drain();}return prior.promise;}
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;}),job={key,p,item,resolve,reject,promise,native,rank,started:false};pending.set(key,job);queue.push(job);sort();drain();return promise;
 }
 return {warmItem,preferProduct(p){preferred=p?productKey(p):'';sort();drain();},warm(p,options={}){return warmItem(p,productPreviewGallery(p)[0],options);},warmGallery(p,{priority=false}={}){return Promise.allSettled(productPreviewGallery(p).map((item,i)=>warmItem(p,item,{native:true,priority:priority&&i===0})));},clearPending(){for(const job of queue.splice(0)){if(pending.get(job.key)===job)pending.delete(job.key);job.resolve(null);}}};
}
export const previewWarmer=createPreviewWarmer();
