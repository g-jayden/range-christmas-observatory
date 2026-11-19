import {cataloguePdf} from './catalogue-pdf.mjs';
import {pdfNativeImage,pdfText} from './native-image-browser.mjs';
import {productKey,productPrice,productSize} from './product-facts.mjs';
import {productNames,PDF_LAYOUT_VERSION} from './product-names.mjs';
const fingerprint=rows=>JSON.stringify([PDF_LAYOUT_VERSION,rows.map(p=>[productKey(p),productNames(p),p.department,p.originalImageUrl,p.originalImageEvidence?.sha256,p.previewImage?.sourceUrl,p.sourceImageConflict||null,Boolean(p.favoriteSourceUnavailable),productPrice(p),productSize(p)])]);
let persisted;
function database(){return persisted??=new Promise((resolve,reject)=>{const r=indexedDB.open('observatory-reports-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('reports');r.onsuccess=()=>resolve(r.result);r.onerror=()=>{persisted=undefined;reject(r.error);};});}
const storage={
 async get(key){const db=await database();return new Promise(resolve=>{const r=db.transaction('reports').objectStore('reports').get('favorites');r.onsuccess=()=>resolve(r.result?.key===key?r.result.blob:null);r.onerror=()=>resolve(null);});},
 async set(key,blob){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction('reports','readwrite');t.objectStore('reports').put({key,blob},'favorites');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});},
 async remove(){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction('reports','readwrite');t.objectStore('reports').delete('favorites');t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
};

// A PDF belongs to one exact collection revision. Serial storage mutations
// ensure that an older build cannot recreate a report after Clear all.
export function createFavoritesReportController({build=cataloguePdf,image=pdfNativeImage,text=pdfText,cache=storage,urls=URL,schedule=setTimeout,cancel=clearTimeout}={}){
 let revision=0,timer,readyUrl,readyKey,writes=Promise.resolve();
 const invalidate=()=>{if(readyUrl)urls.revokeObjectURL(readyUrl);readyUrl=readyKey=undefined;};
 const mutate=(id,operation)=>{writes=writes.catch(()=>{}).then(()=>id===revision?operation():undefined).catch(()=>{});return writes;};
 function prepare(rows,onState){const id=++revision,key=fingerprint(rows);cancel(timer);
  if(readyKey===key&&readyUrl){onState({ready:true,url:readyUrl});return;}
  invalidate();
  onState({ready:false,message:rows.length?'正在后台排版 · Preparing report…':'收藏为空，PDF 已删除 · No favorites; PDF deleted'});
  if(!rows.length){mutate(id,()=>cache.remove());return;}
  const ready=blob=>{if(id!==revision)return;invalidate();readyUrl=urls.createObjectURL(blob);readyKey=key;onState({ready:true,url:readyUrl});};
  timer=schedule(async()=>{try{
   if(rows.some(p=>p.favoriteSourceUnavailable))throw Error('部分商品当前来源未核对 · Some current source records need verification');
   const cached=await cache.get(key).catch(()=>null);if(id!==revision)return;if(cached){ready(cached);return;}
   const parts=await build(rows,{parts:true,image:async p=>{if(id!==revision)throw Error('superseded');return image(p);},text,onProgress:(done,total)=>{if(id===revision)onState({ready:false,message:'正在准备原图和排版 · Preparing originals: '+done+'/'+total});}});
   if(id!==revision)return;const blob=new Blob(parts,{type:'application/pdf'});ready(blob);await mutate(id,()=>cache.set(key,blob));
  }catch(e){if(id===revision)onState({ready:false,message:'报告暂未完成，请重试 · Report not ready: '+e.message,error:true});}},150);
 }
 return {prepare,storageIdle:()=>writes};
}
const controller=createFavoritesReportController();
export const prepareFavoritesReport=(rows,onState)=>controller.prepare(rows,onState);
