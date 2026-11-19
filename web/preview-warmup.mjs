import {annotatedImage} from './native-image-browser.mjs';
import {productPreviewGallery} from './product-preview.mjs';
import {productKey,productPrice,productSize,nativeSourceUrl} from './product-facts.mjs';

// Warm only likely-to-open exact products. Never start collection or a paid
// request here, and keep background native decoding from flooding the network.
export function createPreviewWarmer({prepare=annotatedImage,concurrency=2}={}){
 const queue=[],pending=new Map();let active=0;
 function drain(){while(active<concurrency&&queue.length){const job=queue.shift();active++;Promise.resolve().then(()=>prepare(job.p,job.item)).then(job.resolve,job.reject).finally(()=>{active--;pending.delete(job.key);drain();});}}
 function warm(p,{priority=false}={}){if(p.sourceImageConflict)return Promise.resolve(null);const item=productPreviewGallery(p)[0];if(!item)return Promise.resolve(null);const key=JSON.stringify([productKey(p),nativeSourceUrl(p,item),p.originalImageEvidence,p.observedAt,productPrice(p),productSize(p)]);if(pending.has(key))return pending.get(key);
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});pending.set(key,promise);const job={key,p,item,resolve,reject};priority?queue.unshift(job):queue.push(job);drain();return promise;
 }
 return {warm,clearPending(){for(const job of queue.splice(0)){pending.delete(job.key);job.resolve(null);}}};
}
