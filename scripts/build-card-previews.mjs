import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {nativeSourceUrl,nativeImageCandidates} from '../web/product-facts.mjs';
const OWN='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/';
export async function inlineFirstCardPreviews(products,selected,{root,maxBytes=192*1024}={}){
 let used=0;const results=[];
 for(const p of products){let value=p;const preview=p.fastPreview;
  if(selected.has(String(p.sku))&&/^card-previews\/[a-f0-9]{64}\.webp$/.test(preview?.url||''))try{
   const bytes=await fs.readFile(path.join(root,preview.url));
   if(bytes.length<=48*1024&&used+bytes.length<=maxBytes&&createHash('sha256').update(bytes).digest('hex')===path.basename(preview.url,'.webp')){value={...p,fastPreview:{...preview,inlineUrl:'data:image/webp;base64,'+bytes.toString('base64')}};used+=bytes.length;}
  }catch(e){if(e.code!=='ENOENT')throw e;}
  results.push(value);
 }return results;
}
export function createCardPreviewBuilder(root,{sourceRoot='web',previewCacheRoot='runtime/bq-source/preview-files',fetchVerified=process.env.BROWSE_FETCH_VERIFIED_PREVIEWS==='true',fetcher=globalThis.fetch,encodingCacheRoot='runtime/card-preview-encodings'}={}){
 const work=new Map(),nativeFiles=new Map(),downloads=new Map();let imageRequests=0,imageFailures=0,repositoryImageRequests=0,remoteDenied=false;let generated=0,reused=0,bytes=0,active=0,invalidImages=0,nativeBytes=0;const nativeRetailerBytes=new Map();const queue=[];
 const limit=fn=>new Promise((resolve,reject)=>{queue.push({fn,resolve,reject});drain();});
 function drain(){while(active<4&&queue.length){const job=queue.shift();active++;Promise.resolve().then(job.fn).then(job.resolve,job.reject).finally(()=>{active--;drain();});}}
 const local=value=>{if(typeof value!=='string')return null;const relative=value.startsWith(OWN)?value.slice(OWN.length):value;return /^images\/[\w./-]+\.(?:jpe?g|png|webp|avif)$/i.test(relative)&&!relative.split('/').includes('..')?relative:null;};
 const input=(value,bound)=>{const relative=local(value);if(relative)return {file:path.join(sourceRoot,relative),bound,repository:OWN+relative};if(/^[a-f0-9]{64}$/.test(bound||''))try{const u=new URL(value);if(u.origin==='https://media.diy.com'&&/^\/is\/image\/(?:Kingfisher|KingfisherDigital)\//.test(u.pathname)){u.search='';u.hash='';return {file:path.join(previewCacheRoot,createHash('sha256').update(u.href).digest('hex')+'.jpg'),bound,remote:value};}}catch{}return null;};
 async function readInput({file,bound,remote}){
  let buffer;try{buffer=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(buffer&&/^[a-f0-9]{64}$/.test(bound||'')&&createHash('sha256').update(buffer).digest('hex')!==bound)buffer=null;
  const repository=remote?.startsWith(OWN);if(buffer||!remote||!fetchVerified||remoteDenied&&!repository)return buffer;
  const key=file+'|'+bound;if(!downloads.has(key))downloads.set(key,limit(async()=>{try{
   if(remoteDenied&&!repository)return null;if(repository)repositoryImageRequests++;else imageRequests++;const response=await fetcher(remote,{signal:AbortSignal.timeout(15000)});if(!repository&&(response.status===403||response.status===401))remoteDenied=true;
   if(!response.ok)throw Error('Reviewed source image HTTP '+response.status);
   if(Number(response.headers.get('content-length'))>8*1024*1024)throw Error('Reviewed source preview is too large');
   const reader=response.body.getReader(),parts=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8*1024*1024){await reader.cancel();throw Error('Reviewed source preview is too large');}parts.push(Buffer.from(value));}
   const bytes=Buffer.concat(parts);if(createHash('sha256').update(bytes).digest('hex')!==bound)throw Error('Reviewed preview digest changed');
   await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);return bytes;
  }catch{imageFailures++;return null;}}));return downloads.get(key);
 }
 async function build(p){
  const reviewed=input(p.previewImage?.cachePath,p.previewImage?.sha256);if(reviewed&&p.previewImage?.method==='exact-SKU-reviewed-whole-native')reviewed.remote=OWN+local(p.previewImage.cachePath);
  const candidates=[reviewed,input(p.displayImage?.cachePath,p.displayImage?.sha256),input(p.originalCachedImageUrl,p.nativeExportEvidence?.sha256||p.originalImageEvidence?.sha256),input(p.cachedImageUrl,p.imageCacheEvidence?.sha256)].filter(Boolean);
  const unique=[...candidates.reduce((map,c)=>{if(!map.has(c.file))map.set(c.file,c);return map;},new Map()).values()];
  // Sparse publishers may have a verified original in Git but no working-copy
  // file. Reuse its hash-bound encoding, then existing local inputs; only then
  // restore the exact saved bytes from our own repository. Never send preview
  // traffic back to a protected retailer merely because a sparse file is absent.
  const sources=[...unique.map(c=>({...c,remote:undefined})),...unique.filter(c=>c.remote||/^[a-f0-9]{64}$/.test(c.bound||'')&&c.repository).map(c=>({...c,remote:c.remote||c.repository}))];
  for(const candidate of sources){const {file,bound}=candidate;
   if(/^[a-f0-9]{64}$/.test(bound||''))try{const cacheBase=path.join(encodingCacheRoot,bound+'-whole384q72'),record=JSON.parse(await fs.readFile(cacheBase+'.json','utf8')),encoded=await fs.readFile(cacheBase+'.webp');if(record.sourceImageHash===bound&&/^card-previews\/[a-f0-9]{64}\.webp$/.test(record.url)&&createHash('sha256').update(encoded).digest('hex')===path.basename(record.url,'.webp')){await fs.mkdir(path.join(root,'card-previews'),{recursive:true});await fs.writeFile(path.join(root,record.url),encoded);reused++;bytes+=encoded.length;return {...p,fastPreview:record};}}catch{}
   const buffer=await readInput(candidate);if(!buffer)continue;
   const digest=createHash('sha256').update(buffer).digest('hex');
   if(/^[a-f0-9]{64}$/.test(bound||'')&&bound!==digest)continue;
   const key=digest+'/whole-384-webp-q72';if(!work.has(key))work.set(key,limit(async()=>{
    const cacheBase=path.join(encodingCacheRoot,digest+'-whole384q72');
    try{const record=JSON.parse(await fs.readFile(cacheBase+'.json','utf8')),encoded=await fs.readFile(cacheBase+'.webp');if(record.sourceImageHash===digest&&/^card-previews\/[a-f0-9]{64}\.webp$/.test(record.url)&&createHash('sha256').update(encoded).digest('hex')===path.basename(record.url,'.webp')){await fs.mkdir(path.join(root,'card-previews'),{recursive:true});await fs.writeFile(path.join(root,record.url),encoded);reused++;bytes+=encoded.length;return record;}}catch{}
    let meta,output;try{const image=sharp(buffer);meta=await image.metadata();if(!meta.width||!meta.height)throw Error('Cached preview has no image pixels');output=await image.rotate().resize({width:384,height:384,fit:'inside',withoutEnlargement:true}).webp({quality:72}).toBuffer();}catch{invalidImages++;return null;}
    const hash=createHash('sha256').update(output).digest('hex'),url='card-previews/'+hash+'.webp';await fs.mkdir(path.join(root,'card-previews'),{recursive:true});await fs.writeFile(path.join(root,url),output);generated++;bytes+=output.length;const result={url,sourceImageHash:digest,sourceWidth:meta.width,sourceHeight:meta.height,representation:'uncropped-display-preview-native-original-retained'};await fs.mkdir(encodingCacheRoot,{recursive:true});await fs.writeFile(cacheBase+'.webp',output);await fs.writeFile(cacheBase+'.json',JSON.stringify(result));return result;
   }));
   const preview=await work.get(key);if(preview)return {...p,fastPreview:preview};
  }
  return p;
 }
 async function warmNative(p){
  const source=nativeSourceUrl(p),proof=[p.nativeExportEvidence,p.originalImageEvidence,...(p.originalImages||[]).filter(g=>g.url===source).map(g=>({...g,sourceUrl:g.url,sha256:g.sha256||g.nativeSha256}))].find(e=>e?.sourceUrl===source&&(!e.selectedSku||String(e.selectedSku)===String(p.sku))&&/^[a-f0-9]{64}$/.test(e.sha256||''));
  if(!proof||p.sourceImageConflict)return p;const hash=proof.sha256;
  if(nativeFiles.has(hash))return {...(p.fastPreview?p:await build(p)),browseNative:{...nativeFiles.get(hash),sourceUrl:source}};
  const retailer=(p.retailerId||'the-range')+'/'+(p.collectionId||'christmas');if(proof.bytes>3000000||nativeBytes>=96*1024*1024||(nativeRetailerBytes.get(retailer)||0)>=8*1024*1024)return p;
  for(const file of nativeImageCandidates(p).map(local).filter(Boolean)){
   const buffer=await readInput({file:path.join(sourceRoot,file),bound:hash,remote:OWN+file});if(!buffer)continue;
   if(createHash('sha256').update(buffer).digest('hex')!==hash)continue;
   // Keep first-screen original transfers local without publishing the several
   // gigabytes of historical galleries. The other originals retain their URLs.
   if(buffer.length>3000000||nativeBytes+buffer.length>96*1024*1024||(nativeRetailerBytes.get(retailer)||0)+buffer.length>8*1024*1024)return p;
   const url='native-first/'+hash+path.extname(file).toLowerCase();await fs.mkdir(path.join(root,'native-first'),{recursive:true});await fs.writeFile(path.join(root,url),buffer);nativeBytes+=buffer.length;nativeRetailerBytes.set(retailer,(nativeRetailerBytes.get(retailer)||0)+buffer.length);const entry={url,sha256:hash};nativeFiles.set(hash,entry);return {...(p.fastPreview?p:await build(p)),browseNative:{...entry,sourceUrl:source}};
  }
  return p;
 }
 return {build,warmNative,stats:()=>({generated,reused,bytes,invalidImages,firstScreenNativeBytesByRetailer:Object.fromEntries(nativeRetailerBytes),firstScreenNativeFiles:nativeFiles.size,firstScreenNativeBytes:nativeBytes,sourceRequests:imageRequests,officialPreviewImageRequests:imageRequests,repositoryImageRequests,officialPreviewImageFailures:imageFailures,officialPreviewAccessDenied:remoteDenied,sourceDirectoriesRequested:0,firecrawlCredits:0,originalFilesChanged:0})};
}
