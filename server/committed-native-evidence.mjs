import{createHash}from'node:crypto';import{exactNativeGalleryMember}from'./native-gallery-identity.mjs';
const OWN='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/';
export async function hasCommittedNativeEvidence(p,source,{tracked,read,metadata}={}){
 const declared=p.originalImageEvidence,exported=p.nativeExportEvidence,validExport=exported?.sourceUrl===source&&String(exported.selectedSku)===String(p.sku)&&exported.width===declared?.width&&exported.height===declared?.height&&exported.sourceVersion===declared?.sourceVersion,proof=validExport?{...declared,sha256:exported.sha256}:declared;
 if(proof?.sourceUrl!==source||!p.originalImages?.some(g=>g.url===source&&exactNativeGalleryMember(p,g))||!p.originalCachedImageUrl||!/^[a-f0-9]{64}$/.test(proof.sha256||'')||!(proof.width>=64&&proof.height>=64))return false;
 const relative=p.originalCachedImageUrl.startsWith(OWN)?p.originalCachedImageUrl.slice(OWN.length):p.originalCachedImageUrl;
 if(!new RegExp('^images/(?:source|ar|asda|ms|bm|hb|du|nx|jl|mt|bq)/'+proof.sha256+'(?:-native)?\\.(?:jpg|jpeg|png|webp|avif|gif)$').test(relative)||!tracked.has('web/'+relative))return false;
 try{const bytes=await read('web/'+relative);if(createHash('sha256').update(bytes).digest('hex')!==proof.sha256)return false;const shape=await metadata(bytes);return shape.width===proof.width&&shape.height===proof.height;}catch{return false;}
}
