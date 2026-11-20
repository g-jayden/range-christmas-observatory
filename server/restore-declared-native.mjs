import {createHash} from 'node:crypto';
import {validateRangeNativeEntry} from './range-native-plan.mjs';
// Reconnect an already committed original only to its existing exact-SKU proof.
// A different byte version at the same URL is not an interchangeable original.
export async function restoreDeclaredNative(target,{tracked,read,metadata,now=()=>new Date().toISOString()}={}){
 const proof=target.expectedNative;
 if(!/^[a-f0-9]{64}$/.test(proof?.sha256||'')||proof.sourceUrl!==target.variantImageUrl||!(proof.width>=64&&proof.height>=64)||!Number.isFinite(Date.parse(proof.observedAt)))return null;
 for(const ext of ['jpg','png','webp','avif','gif']){
  const cachedImageUrl='images/source/'+proof.sha256+'.'+ext,file='web/'+cachedImageUrl;if(!tracked.has(file))continue;
  let bytes,shape;try{bytes=await read(file);if(createHash('sha256').update(bytes).digest('hex')!==proof.sha256)continue;shape=await metadata(bytes);}catch{continue;}
  const entry={url:target.variantImageUrl,ok:true,hash:proof.sha256,cachedImageUrl,width:shape.width,height:shape.height,bytes:bytes.length,observedAt:proof.observedAt,restoredAt:now(),selectedSku:String(target.sku),sourceContextUrl:target.sourceUrl,method:'reuse-committed-exact-SKU-declared-native-bytes'};
  try{return validateRangeNativeEntry(target,entry);}catch{}
 }
 return null;
}
