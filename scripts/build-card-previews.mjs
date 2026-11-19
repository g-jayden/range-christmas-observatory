import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {nativeSourceUrl,nativeImageCandidates} from '../web/product-facts.mjs';
const OWN='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/';
export function createCardPreviewBuilder(root,{sourceRoot='web',previewCacheRoot='runtime/bq-source/preview-files'}={}){
 const work=new Map(),nativeFiles=new Map();let generated=0,bytes=0,active=0,invalidImages=0,nativeBytes=0;const queue=[];
 const limit=fn=>new Promise((resolve,reject)=>{queue.push({fn,resolve,reject});drain();});
 function drain(){while(active<4&&queue.length){const job=queue.shift();active++;Promise.resolve().then(job.fn).then(job.resolve,job.reject).finally(()=>{active--;drain();});}}
 const local=value=>{if(typeof value!=='string')return null;const relative=value.startsWith(OWN)?value.slice(OWN.length):value;return /^images\/[\w./-]+\.(?:jpe?g|png|webp|avif)$/i.test(relative)&&!relative.split('/').includes('..')?relative:null;};
 const input=(value,bound)=>{const relative=local(value);if(relative)return {file:path.join(sourceRoot,relative),bound};if(/^[a-f0-9]{64}$/.test(bound||''))try{const u=new URL(value);if(u.origin==='https://media.diy.com'&&/^\/is\/image\/(?:Kingfisher|KingfisherDigital)\//.test(u.pathname)){u.search='';u.hash='';return {file:path.join(previewCacheRoot,createHash('sha256').update(u.href).digest('hex')+'.jpg'),bound};}}catch{}return null;};
 async function build(p){
  const candidates=[input(p.previewImage?.cachePath,p.previewImage?.sha256),input(p.displayImage?.cachePath,p.displayImage?.sha256),input(p.originalCachedImageUrl,p.nativeExportEvidence?.sha256||p.originalImageEvidence?.sha256),input(p.cachedImageUrl,p.imageCacheEvidence?.sha256)].filter(Boolean);
  for(const {file,bound}of [...new Map(candidates.map(c=>[c.file,c])).values()]){let buffer;try{buffer=await fs.readFile(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   const digest=createHash('sha256').update(buffer).digest('hex');
   if(/^[a-f0-9]{64}$/.test(bound||'')&&bound!==digest)continue;
   const key=digest+'/whole-480-webp-q80';if(!work.has(key))work.set(key,limit(async()=>{
    let meta,output;try{const image=sharp(buffer);meta=await image.metadata();if(!meta.width||!meta.height)throw Error('Cached preview has no image pixels');output=await image.rotate().resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer();}catch{invalidImages++;return null;}
    const hash=createHash('sha256').update(output).digest('hex'),url='card-previews/'+hash+'.webp';await fs.mkdir(path.join(root,'card-previews'),{recursive:true});await fs.writeFile(path.join(root,url),output);generated++;bytes+=output.length;return {url,sourceImageHash:digest,sourceWidth:meta.width,sourceHeight:meta.height,representation:'uncropped-display-preview-native-original-retained'};
   }));
   const preview=await work.get(key);if(preview)return {...p,fastPreview:preview};
  }
  return p;
 }
 async function warmNative(p){
  const source=nativeSourceUrl(p),proof=[p.nativeExportEvidence,p.originalImageEvidence,...(p.originalImages||[]).filter(g=>g.url===source).map(g=>({...g,sourceUrl:g.url,sha256:g.sha256||g.nativeSha256}))].find(e=>e?.sourceUrl===source&&(!e.selectedSku||String(e.selectedSku)===String(p.sku))&&/^[a-f0-9]{64}$/.test(e.sha256||''));
  if(!proof||p.sourceImageConflict)return p;const hash=proof.sha256;
  if(nativeFiles.has(hash))return {...p,browseNative:{...nativeFiles.get(hash),sourceUrl:source}};
  for(const file of nativeImageCandidates(p).map(local).filter(Boolean)){
   let buffer;try{buffer=await fs.readFile(path.join(sourceRoot,file));}catch(e){if(e.code==='ENOENT')continue;throw e;}
   if(createHash('sha256').update(buffer).digest('hex')!==hash)continue;
   // Keep first-screen original transfers local without publishing the several
   // gigabytes of historical galleries. The other originals retain their URLs.
   if(buffer.length>3000000||nativeBytes+buffer.length>150*1024*1024)return p;
   const url='native-first/'+hash+path.extname(file).toLowerCase();await fs.mkdir(path.join(root,'native-first'),{recursive:true});await fs.writeFile(path.join(root,url),buffer);nativeBytes+=buffer.length;const entry={url,sha256:hash};nativeFiles.set(hash,entry);return {...p,browseNative:{...entry,sourceUrl:source}};
  }
  return p;
 }
 return {build,warmNative,stats:()=>({generated,bytes,invalidImages,firstScreenNativeFiles:nativeFiles.size,firstScreenNativeBytes:nativeBytes,sourceRequests:0,firecrawlCredits:0,originalFilesChanged:0})};
}
