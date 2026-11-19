import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

// The preview and the original are separate files. A 400px preview can never
// qualify as the original used by Save Image, the report or a NEW digest.
export async function ensureArNativeImage(p,{fetcher=fetch,sharp,root='web'}={}){
 if(!sharp)sharp=(await import('sharp')).default;
 const source=p.previewImage?.sourceUrl;
 const gallery=p.originalImages?.find(g=>g.url===source&&g.selectedSku===p.sku);
 if(!gallery||new URL(source).origin!=='https://media.4rgos.it')throw Error('Argos exact-SKU native gallery mapping absent');
 const prior=p.originalImageEvidence;
 if(prior?.sourceUrl===source&&prior.sourcePreviewHash===p.previewImage.sha256&&p.originalCachedImageUrl){
  try{const bytes=await fs.readFile(root+'/'+p.originalCachedImageUrl);if(createHash('sha256').update(bytes).digest('hex')===prior.sha256)return prior;}catch{}
 }
 let responseUrl=source;let r=await fetcher(source,{signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Object.assign(Error('Argos native original HTTP '+r.status),{status:r.status});
 let bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>25000000)throw Error('Argos native original exceeds file guard');
 let meta=await sharp(bytes).metadata();
 if(meta.width!==p.previewImage.sourceWidth||meta.height!==p.previewImage.sourceHeight){const u=new URL(source);u.searchParams.set('maxW',String(p.previewImage.sourceWidth));u.searchParams.set('maxH',String(p.previewImage.sourceHeight));u.searchParams.set('upscale','false');responseUrl=u.href;r=await fetcher(responseUrl,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Argos full native-pixel source export HTTP '+r.status);bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>25000000)throw Error('Argos native original exceeds file guard');meta=await sharp(bytes).metadata();}
 if(meta.width!==p.previewImage.sourceWidth||meta.height!==p.previewImage.sourceHeight)throw Error('Argos original does not match official native pixel dimensions');
 const extension={jpeg:'jpg',png:'png',webp:'webp',avif:'avif'}[meta.format];if(!extension)throw Error('Unsupported Argos native original format');
 const sha256=createHash('sha256').update(bytes).digest('hex'),relative='images/ar/'+sha256+'-native.'+extension;
 await fs.mkdir(root+'/images/ar',{recursive:true});await fs.writeFile(root+'/'+relative,bytes);
 p.originalCachedImageUrl=relative;
 p.originalImageEvidence={sourceUrl:source,responseUrl,selectedSku:p.sku,sourceParentId:p.parentGroupId,sha256,sourcePreviewHash:p.previewImage.sha256,width:meta.width,height:meta.height,bytes:bytes.length,observedAt:new Date().toISOString(),method:'exact-official-gallery-original-response-bytes-native-metadata-dimensions'};
 return p.originalImageEvidence;
}
