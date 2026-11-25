import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import sharp from 'sharp';
import {bindSpringSavedGalleryNatives} from './spring-native-preview.mjs';
import {materializeCommittedImage} from './committed-image-file.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';

// Feed comparison/quality selection with the original bytes already acquired
// in the shared daily batch. This adapter has no retailer or paid transport.
export async function prepareSpringSavedNativePreviews(products,entries){
 bindSpringSavedGalleryNatives(products,entries);
 const file='web/preview-source-index.json.gz';let index;
 try{index=JSON.parse(gunzipSync(await fs.readFile(file)));}catch(e){if(e.code!=='ENOENT')throw e;index={version:1,entries:{}};}
 let rendered=0,reused=0;const seen=new Set,unavailable=[];
 for(const p of products)for(const g of p.originalImages||[]){const e=entries?.[g.url];
  if(!e||!exactNativeGalleryMember(p,g)||g.variantId!=null&&String(g.variantId)!==String(p.variantId)||g.nativeCachePath!==e.cachedImageUrl||g.nativeSha256!==e.hash||seen.has(g.url))continue;seen.add(g.url);
  const old=index.entries[g.url];
  if(old?.sourceHash===e.hash&&old.sourceWidth===e.width&&old.sourceHeight===e.height&&/^[a-f0-9]{64}$/.test(old.hash||'')&&old.file==='web/images/previews/'+old.hash+'.webp')try{const b=await fs.readFile(old.file);if(createHash('sha256').update(b).digest('hex')===old.hash){reused++;continue;}}catch(error){if(error.code!=='ENOENT')throw error;}
  try{
   await materializeCommittedImage(e.cachedImageUrl,e.hash);const original=await fs.readFile('web/'+e.cachedImageUrl);
   if(createHash('sha256').update(original).digest('hex')!==e.hash)throw Error('Saved native comparison digest mismatch');
   const metadata=await sharp(original).metadata();if(metadata.width!==e.width||metadata.height!==e.height)throw Error('Saved native comparison dimensions mismatch');
   const {data,info}=await sharp(original).rotate().resize({width:320,height:320,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toBuffer({resolveWithObject:true}),hash=createHash('sha256').update(data).digest('hex'),preview='web/images/previews/'+hash+'.webp';
   await fs.mkdir('web/images/previews',{recursive:true});await fs.writeFile(preview,data);
   index.entries[g.url]={url:g.url,ok:true,sourceWidth:e.width,sourceHeight:e.height,sourceHash:e.hash,width:info.width,height:info.height,hash,file:preview,checkedAt:new Date().toISOString(),method:'saved-exact-native-local-comparison'};rendered++;
  }catch(error){unavailable.push({sku:p.sku,url:g.url,error:String(error.message).slice(0,160)});}
 }
 if(rendered){await fs.writeFile(file+'.tmp',gzipSync(JSON.stringify(index)));await fs.rename(file+'.tmp',file);}
 return{prepared:rendered+reused,rendered,reused,unavailable,sourceRequests:0,firecrawlCredits:0};
}
