import fs from'node:fs/promises';
import{createHash}from'node:crypto';
import{materializeCommittedImage}from'./committed-image-file.mjs';
import{allowedPublicImage}from'../cloud/public-image.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
export function verifiedManufacturerEntry(url,e){
 let host;try{host=new URL(url).hostname;}catch{return false;}
 return Boolean(host==='cdn.shopify.com'&&allowedPublicImage(url)&&e?.ok===true&&e.method==='exact-listed-photo-and-primary-manufacturer-native'&&e.sourceBytesUnchanged===true&&/^[a-f0-9]{64}$/.test(e.hash||'')&&new RegExp('^images/source/'+e.hash+'\\.(?:jpg|png|webp|avif|gif)$').test(e.cachedImageUrl||'')&&Math.max(e.width||0,e.height||0)>=1000);
}
// These entries are created only after the current exact-SKU Root photograph
// and original bytes have passed independent pixel verification. Full updates
// must retain the same proof rather than rejecting the manufacturer's host or
// sending an already archived original to another paid source batch.
export async function retainManufacturerOriginal(url,entry,{materialize=materializeCommittedImage,read=fs.readFile,freeRead}={}){
 if(!verifiedManufacturerEntry(url,entry))return null;
 try{await materialize(entry.cachedImageUrl,entry.hash);const b=await read('web/'+entry.cachedImageUrl);if(digest(b)!==entry.hash)throw Error('Original archive digest changed');return{...entry,url,retained:true};}
 catch(error){if(freeRead){try{const fresh=await freeRead(url);if(fresh?.ok&&fresh.hash===entry.hash&&fresh.width===entry.width&&fresh.height===entry.height)return{...entry,url,retained:true,restoredByFreeTransport:true};}catch{}}
  return{url,ok:false,error:'Verified manufacturer original unavailable or changed; exact image proof must be retained or re-established',manufacturerProofPending:true};}
}
