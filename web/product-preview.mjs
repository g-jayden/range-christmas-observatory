export const cardPreviewSource=p=>p.fastPreview?.url||p.previewImage?.cachePath||p.displayImage?.cachePath||p.originalCachedImageUrl||p.originalImageUrl||p.cachedImageUrl||p.variantImageUrl||p.imageUrl||'';
export function productPreviewGallery(p,full=p){
 if(p.displayImage)return [{url:p.displayImage.sourceUrl,thumbnail:p.fastPreview?.url||p.displayImage.cachePath,fallback:p.displayImage.cachePath}];
 const items=[],seen=new Set,add=(url,thumbnail,fallback)=>{if(!url||seen.has(url))return;seen.add(url);items.push({url,thumbnail:thumbnail||url,fallback});};
 const originals=full.originalImages||p.originalImages||[];
 const reviewed=reviewedWholeGalleryPhoto({...full,...p,detailEvidence:full.detailEvidence||p.detailEvidence},originals);
 if(reviewed)add(reviewed.url,reviewed.nativeCachePath||reviewed.thumbnail,reviewed.nativeCachePath||reviewed.thumbnail);
 if(p.previewImage){const pair=originals.find(g=>g.url===p.previewImage.sourceUrl||g.thumbnail===p.previewImage.sourceUrl);add(pair?.url||p.previewImage.sourceUrl,p.fastPreview?.url||p.previewImage.cachePath,p.previewImage.cachePath);}
 for(const g of originals)if((!g.selectedSku||String(g.selectedSku)===String(p.sku))&&(!p.variantId||!g.variantId||String(g.variantId)===String(p.variantId))){const cached=g.thumbnail===p.imageCacheEvidence?.sourceUrl?p.cachedImageUrl:null;add(g.url,cached||g.thumbnail,cached||g.thumbnail);}
 if(!items.length)add(p.originalImageUrl||full.originalImageUrl||p.variantImageUrl||p.imageUrl,p.cachedImageUrl,p.cachedImageUrl);
 if(!originals.length)for(const url of full.images||p.images||[])add(url);
 return items;
}
import{reviewedWholeGalleryPhoto}from'./source-photo-selection.mjs';
