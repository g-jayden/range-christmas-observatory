export const SOURCE_PHOTO_CONFLICT_PLACEHOLDER='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f4f2eb"/><g fill="#36594c" text-anchor="middle" font-family="sans-serif"><text x="300" y="275" font-size="26">官网配图与商品不一致</text><text x="300" y="320" font-size="19">Official product photo mismatch</text><text x="300" y="357" font-size="17">已隔离错图 · Photo quarantined</text></g></svg>');
import{knownForeignProductPhoto}from'./bq-foreign-photo-model.mjs';
export const cardPreviewSource=p=>p.sourcePhotoQuarantined||p.sourceImageConflict?.galleryQuarantine||knownForeignProductPhoto(p)?SOURCE_PHOTO_CONFLICT_PLACEHOLDER:p.fastPreview?.inlineUrl||p.fastPreview?.url||p.previewImage?.cachePath||p.displayImage?.cachePath||p.originalCachedImageUrl||p.originalImageUrl||p.cachedImageUrl||p.variantImageUrl||p.imageUrl||'';
export function productPreviewGallery(p,full=p){
 if(p.sourcePhotoQuarantined||full.sourcePhotoQuarantined||p.sourceImageConflict?.galleryQuarantine||full.sourceImageConflict?.galleryQuarantine||knownForeignProductPhoto(p)||knownForeignProductPhoto(full))return [];
 if(p.displayImage)return [{url:p.displayImage.sourceUrl,thumbnail:p.fastPreview?.url||p.displayImage.cachePath,fallback:p.displayImage.cachePath}];
 const items=[],seen=new Set,add=(url,thumbnail,fallback,evidence={})=>{if(!url||seen.has(url))return;seen.add(url);items.push({...evidence,url,thumbnail:thumbnail||url,fallback});};
 const rawOriginals=full.originalImages||p.originalImages||[],equivalent=p.identicalPhotoOriginalEvidence||full.identicalPhotoOriginalEvidence;
 // An audited larger copy of the identical photograph replaces its thumbnail
 // in the gallery; do not offer that same 300px photo as a second detail frame.
 const originals=equivalent?.comparison?.equivalent===true&&rawOriginals.some(g=>g.url===equivalent.nativeUrl&&String(g.selectedSku)===String(p.sku))?rawOriginals.filter(g=>g.url!==equivalent.rootUrl):rawOriginals;
 const reviewed=reviewedWholeGalleryPhoto({...full,...p,detailEvidence:full.detailEvidence||p.detailEvidence},originals);
 if(reviewed)add(reviewed.url,reviewed.nativeCachePath||reviewed.thumbnail,reviewed.nativeCachePath||reviewed.thumbnail,reviewed);
 if(p.previewImage){const pair=originals.find(g=>g.url===p.previewImage.sourceUrl||g.thumbnail===p.previewImage.sourceUrl);add(pair?.url||p.previewImage.sourceUrl,p.fastPreview?.inlineUrl||p.fastPreview?.url||p.previewImage.cachePath,p.previewImage.cachePath,pair);}
 for(const g of originals)if((!g.selectedSku||String(g.selectedSku)===String(p.sku))&&(!p.variantId||!g.variantId||String(g.variantId)===String(p.variantId))){const cached=g.thumbnail===p.imageCacheEvidence?.sourceUrl?p.cachedImageUrl:null;add(g.url,g.thumbnailCachePath||g.nativeCachePath||cached||g.thumbnail,g.nativeCachePath||cached||g.thumbnail,g);}
 if(!items.length)add(p.originalImageUrl||full.originalImageUrl||p.variantImageUrl||p.imageUrl,p.cachedImageUrl,p.cachedImageUrl);
 if(!originals.length)for(const url of full.images||p.images||[])add(url);
 return items;
}
import{reviewedWholeGalleryPhoto}from'./source-photo-selection.mjs';
