import fs from'node:fs/promises';import path from'node:path';import{acceptedImageGallery}from'./range-image-gallery.mjs';import{exactNativeGalleryMember}from'./native-gallery-identity.mjs';
import{nativeSourceUrl}from'../web/product-facts.mjs';
export function needsRangeNativeGallery(p){const source=nativeSourceUrl(p);return p.taxonomyAudit?.disposition==='include'&&!p.sourceImageConflict&&(!source||!(p.originalImages||[]).some(g=>g.url===source&&exactNativeGalleryMember(p,g)));}
export function applyRecoveredRangeGalleries(products,registry){let applied=0;for(const p of products){if(!p||typeof p!=='object'||!p.sku)continue;const row=registry?.entries?.[p.sku];if(!acceptedImageGallery(p,row))continue;
 if((p.originalImages||[]).some(g=>exactNativeGalleryMember(p,g))&&Date.parse(p.originalSourceEvidence?.observedAt)>=Date.parse(row.observedAt))continue;
 p.originalImages=row.images.map(g=>({...g}));p.originalImageUrl=row.images.find(g=>g.thumbnail===(p.variantImageUrl||p.imageUrl))?.url||row.images[0].url;
 p.originalSourceEvidence={version:'official-exact-SKU-image-gallery-only',selectedSku:String(p.sku),sourceUrl:row.sourceUrl,inputSourceUrl:p.sourceUrl,observedAt:row.observedAt};
 if(p.originalImageEvidence?.sourceUrl!==p.originalImageUrl){delete p.originalCachedImageUrl;delete p.originalImageEvidence;}
 applied++;
 }return applied;}
export async function applyRecoveredRangeGalleryFiles(root='public',indexRoot='web'){
 const registry=await fs.readFile(path.join(indexRoot,'range-native-gallery.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return{entries:{}};throw e;});if(!Object.keys(registry.entries||{}).length)return{applied:0,sourceRequests:0,firecrawlCredits:0};let applied=0;
 const files=['catalogue.json','decorations.json','lights.json','themes.json'];for(const dir of['classified','decoration-details','light-details','theme-details'])for(const name of await fs.readdir(path.join(root,dir)).catch(e=>{if(e.code==='ENOENT')return[];throw e;}))if(name.endsWith('.json'))files.push(dir+'/'+name);
 for(const name of files){const file=path.join(root,name);let data;try{data=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}const count=applyRecoveredRangeGalleries(data.products||Object.values(data),registry);if(count){applied+=count;await fs.writeFile(file,JSON.stringify(data));}}
 return{applied,sourceRequests:0,firecrawlCredits:0};
}
