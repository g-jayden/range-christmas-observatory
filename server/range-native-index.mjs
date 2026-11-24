import{nativeSourceUrl}from'../web/product-facts.mjs';
import{reviewedWholeGalleryPhoto}from'../web/source-photo-selection.mjs';
import{exactNativeGalleryMember}from'./native-gallery-identity.mjs';
import{bindRangeDirectoryNative}from'./range-directory-native.mjs';
import fs from'node:fs/promises';import path from'node:path';
// URL identity remains the official full-resolution gallery resource, never a
// thumbnail. Stored responses retain their native bytes and pixel dimensions.
export function applyRangeNativeIndex(products,index){let applied=0;for(const p of products){const gallery=p.originalImages||[],known=g=>exactNativeGalleryMember(p,g);for(const g of gallery){const e=index.entries?.[g.url];if(known(g)&&e?.ok&&e.hash&&e.cachedImageUrl){g.nativeCachePath=e.cachedImageUrl;g.nativeSha256=e.hash;g.sourceWidth=e.width;g.sourceHeight=e.height;}}
 const desired=nativeSourceUrl(p)||gallery.find(g=>g.thumbnail===p.variantImageUrl)?.url,e=index.entries?.[desired];if(!e?.ok||!gallery.some(g=>g.url===desired&&known(g)))continue;p.originalImageUrl=desired;p.originalCachedImageUrl=e.cachedImageUrl;p.originalImageEvidence={sourceUrl:desired,selectedSku:String(p.sku),sha256:e.hash,width:e.width,height:e.height,bytes:e.bytes,observedAt:e.observedAt,method:gallery.find(g=>g.url===desired)?.listingEvidence?'exact-official-SKU-directory-image-native-response-byte-mirror':'exact-official-gallery-native-response-byte-mirror'};if(reviewedWholeGalleryPhoto(p)?.url===desired)p.previewImage={selectedSku:String(p.sku),sourceUrl:desired,sourceProductUrl:p.sourceUrl,cachePath:e.cachedImageUrl,sha256:e.hash,width:e.width,height:e.height,originalWidth:e.width,originalHeight:e.height,originalSha256:e.hash,method:'exact-SKU-reviewed-whole-native',verifiedAt:e.observedAt};applied++;}return applied;}
// An identical SKU can be observed in two directories with different selected
// gallery frames. Mirror each current selection independently; an older card
// must not replace the native proof belonging to another scope's newer frame.
function sameNativeSelection(p,q){const current=p.variantImageUrl||p.listingVariantImageUrl||p.imageUrl,other=q.variantImageUrl||q.listingVariantImageUrl||q.imageUrl;return String(p.sku)===String(q.sku)&&p.sourceUrl===q.sourceUrl&&(!p.variantId||!q.variantId||String(p.variantId)===String(q.variantId))&&(!current||current===other);}
export async function applyRangeNativeFiles(root='public',indexRoot='web'){
 let index;try{index=JSON.parse(await fs.readFile(path.join(indexRoot,'range-native-index.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return{applied:0};throw e;}
 const documents=[],fullBySku=new Map();
 for(const dir of ['decoration-details','light-details','theme-details'])for(const n of await fs.readdir(path.join(root,dir)).catch(()=>[]))if(n.endsWith('.json')){const file=path.join(root,dir,n),data=JSON.parse(await fs.readFile(file,'utf8'));documents.push({file,data,rows:Object.values(data)});for(const p of Object.values(data))if(p.originalImages?.length){const key=String(p.sku);if(!fullBySku.has(key))fullBySku.set(key,[]);fullBySku.get(key).push(p);}}
 const files=['catalogue.json','decorations.json','lights.json','themes.json'];for(const n of await fs.readdir(path.join(root,'classified')).catch(()=>[]))if(n.endsWith('.json'))files.push('classified/'+n);
 for(const name of files)try{const file=path.join(root,name),data=JSON.parse(await fs.readFile(file,'utf8'));documents.push({file,data,rows:data.products||[]});}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const d of documents)bindRangeDirectoryNative(d.data);for(const d of documents)for(const p of d.rows)if(p?.directoryImageEvidence&&p.originalImages?.length){const key=String(p.sku);if(!fullBySku.has(key))fullBySku.set(key,[]);fullBySku.get(key).push(p);}
 let applied=0;for(const d of documents){let changed=0;for(const p of d.rows){if(!p?.sku)continue;if(p.originalImages?.length){changed+=applyRangeNativeIndex([p],index);continue;}const candidates=fullBySku.get(String(p.sku))||[],q=candidates.find(q=>sameNativeSelection(p,q));if(!q)continue;if(q.directoryImageEvidence){p.originalImages=q.originalImages;p.directoryImageEvidence=q.directoryImageEvidence;}const exact={...q,previewImage:p.previewImage||q.previewImage,displayImage:p.displayImage||q.displayImage};if(applyRangeNativeIndex([exact],index)){for(const k of ['originalImageUrl','originalCachedImageUrl','originalImageEvidence','previewImage'])p[k]=exact[k];for(const q of candidates.filter(q=>sameNativeSelection(p,q)&&q.originalImages?.some(g=>g.url===exact.originalImageUrl&&String(g.selectedSku)===String(p.sku)))){for(const k of ['originalImageUrl','originalCachedImageUrl','originalImageEvidence','previewImage'])q[k]=exact[k];if(p.previewImage)q.previewImage=p.previewImage;}changed++;}}
  if(changed)applied+=changed;
 }
 if(applied)for(const d of documents)await fs.writeFile(d.file,JSON.stringify(d.data));
 return{applied,sourceRequests:0,firecrawlCredits:0};
}
