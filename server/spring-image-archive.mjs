import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {restoreSourceImageArchive} from './source-image-archive.mjs';import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {gunzipSync} from 'node:zlib';
import {springSourceDecision} from '../web/spring-model.mjs';
import {springReviewExcludes} from './spring-review-evidence.mjs';
export async function restoreSpringImageArchive(source,checkpoint,{restore=restoreSourceImageArchive,root='web',previewIndex,reviews}={}){
 if(!reviews)try{reviews=JSON.parse(await fs.readFile(root+'/spring/manual-reviews.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;reviews={products:{}};}
 const products=(source.products||[]).filter(p=>springSourceDecision(p).disposition!=='exclude'&&!springReviewExcludes(p,reviews.products?.[p.sku]));
 const entries={...source.imageAudit?.entries,...checkpoint.entries},localMissing=(source.imageAudit?.failures||[]).filter(e=>e.hash&&e.cachedImageUrl&&/^ENOENT:/.test(e.error||''));for(const e of localMissing)if(!entries[e.url]||Date.parse(entries[e.url].observedAt||0)<Date.parse(e.observedAt||0))entries[e.url]=e;
 // Recovery indexes are shared with Christmas and other retailers. Restore
 // only this source's gallery and listing pixels, rather than downloading
 // every unrelated historical original before each Spring update.
 const wantedUrls=new Set;for(const p of products){for(const u of[p.originalImageUrl,p.variantImageUrl,p.imageUrl,p.listingVariantImageUrl,p.previewImage?.sourceUrl,p.originalImageEvidence?.sourceUrl,p.imageCacheEvidence?.sourceUrl])if(u)wantedUrls.add(u);for(const g of p.originalImages||[])if(exactNativeGalleryMember(p,g))wantedUrls.add(g.url);}
 if(!previewIndex)try{previewIndex=JSON.parse(gunzipSync(await fs.readFile(root+'/preview-source-index.json.gz')));}catch(error){if(error.code!=='ENOENT')throw error;previewIndex={entries:{}};}
 const comparisonPreviews=[];for(const[url,p]of Object.entries(previewIndex.entries||{}))if(wantedUrls.has(url)&&/^[a-f0-9]{64}$/.test(p.hash||'')&&p.file==='web/images/previews/'+p.hash+'.webp')comparisonPreviews.push({file:p.file.slice(4),sha256:p.hash});
 const records=Object.entries(entries).filter(([url,e])=>wantedUrls.has(url)&&e.cachedImageUrl&&e.hash).map(([,e])=>({file:e.cachedImageUrl,sha256:e.hash}));for(const p of products){if(p.originalCachedImageUrl&&p.originalImageEvidence?.sha256)records.push({file:p.originalCachedImageUrl,sha256:p.originalImageEvidence.sha256});if(p.previewImage?.cachePath&&p.previewImage.sha256)records.push({file:p.previewImage.cachePath,sha256:p.previewImage.sha256});}
 records.push(...comparisonPreviews);const restored=await restore(records,{root}),verified=new Map;let repairedMissingFiles=0,rebound=0;
 for(const p of products){const gallery=p.originalImages?.find(g=>g.url===p.originalImageUrl&&exactNativeGalleryMember(p,g)),url=gallery?.url,e=url&&entries[url];if(!e||!e.cachedImageUrl||!e.hash||e.width<64||e.height<64)continue;if(e.ok!==true&&!/^ENOENT:/.test(e.error||''))continue;
  if(!verified.has(e.cachedImageUrl))try{const bytes=await fs.readFile(root+'/'+e.cachedImageUrl);verified.set(e.cachedImageUrl,createHash('sha256').update(bytes).digest('hex')===e.hash);}catch{verified.set(e.cachedImageUrl,false);}if(!verified.get(e.cachedImageUrl))continue;
  if(e.ok!==true){entries[url]={...e,ok:true,archiveRestored:true};delete entries[url].error;repairedMissingFiles++;}p.cachedImageUrl=e.cachedImageUrl;p.imageCacheEvidence={sourceUrl:url,sha256:e.hash,observedAt:e.observedAt,width:e.width,height:e.height,bytes:e.bytes,mime:e.mime};
  if(!p.originalImageEvidence||p.originalImageEvidence.sourceUrl===url){p.originalCachedImageUrl=e.cachedImageUrl;p.originalImageEvidence={...p.imageCacheEvidence};}rebound++;
 }
 source.imageAudit||={};source.imageAudit.entries={...source.imageAudit.entries,...Object.fromEntries(Object.entries(entries).filter(([,e])=>e.ok===true))};source.imageAudit.failures=(source.imageAudit.failures||[]).filter(e=>!(/^ENOENT:/.test(e.error||'')&&entries[e.url]?.hash===e.hash&&verified.get(entries[e.url]?.cachedImageUrl)));source.imageAudit.failed=source.imageAudit.failures.length;source.imageAudit.loaded=source.imageAudit.checked-source.imageAudit.failed;
 return{...restored,eligibleSourceProducts:products.length,excludedSourceProductsSkipped:(source.products||[]).length-products.length,referencedComparisonPreviews:comparisonPreviews.length,unrelatedSharedOriginalsSkipped:Object.keys(entries).filter(url=>!wantedUrls.has(url)).length,reboundExactNativeProducts:rebound,repairedLocalMissingImages:repairedMissingFiles,retailerRequests:0,firecrawlCredits:0};
}
