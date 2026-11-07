import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
export async function ensureMailImageFormat(manifest,directory){
 const original=manifest.original;if(!original?.url)return false;
 if(/\.(?:jpe?g|png|gif|tiff?|bmp)$/i.test(new URL(original.url).pathname))return false;
 const filename=new URL(original.url).pathname.split('/').pop(),bytes=await fs.readFile(directory+'/'+filename);
 if(createHash('sha256').update(bytes).digest('hex')!==original.sha256)throw Error('Native original digest mismatch');
 const sharp=(await import('sharp')).default,png=await sharp(bytes).png({compressionLevel:9}).toBuffer();
 const sourcePixels=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),targetPixels=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(sourcePixels.info.width!==targetPixels.info.width||sourcePixels.info.height!==targetPixels.info.height||!sourcePixels.data.equals(targetPixels.data))throw Error('Lossless mail conversion changed source pixels');
 await fs.writeFile(directory+'/original-lossless.png',png);
 manifest.mailOriginal={...original,url:original.url.replace(/[^/]+$/,'original-lossless.png'),sha256:createHash('sha256').update(png).digest('hex'),bytes:png.length,format:'png',losslessDecodedCopy:true,nativeOriginalUrl:original.url};return true;
}
