import {productDimensions,treeHeightConflict} from './catalogue-model.mjs';
import {retailerForScope,retailerName} from './retailers.mjs';

export const productRetailer=p=>p.retailerId==='the-range-gb'?'the-range':p.retailerId||retailerForScope(p.department||p.kind);
export const productKey=p=>productRetailer(p)+':'+String(p.canonicalSku||p.sku);
export const productPrice=p=>Number.isFinite(p.priceGBP)?'£'+p.priceGBP.toFixed(2):'官网未标价 · Price not specified';
export function productSize(p){
 const conflict=treeHeightConflict(p);
 if(conflict&&!conflict.usableHeightCm)return '官网尺寸冲突 · Conflicting source dimensions';
 if(conflict)return conflict.usableHeightCm+'cm';
 const d=p.dimensions?.label?p.dimensions:productDimensions(p.specifications||{});
 if(d.axes?.length||d.sourceSize||d.categoryLabel)return d.sourceSize||d.label;
 return p.heightLabel||p.specifications?.Dimensions||p.specifications?.Size||(p.skirtDiameterCm?p.skirtDiameterCm+'cm':'官网未注明尺寸 · Size not specified');
}
export const reportRetailer=p=>retailerName(productRetailer(p));
export function nativeSourceUrl(p,item){
 if(item?.url)return item.url;
 if(p.displayImage?.sourceUrl)return p.displayImage.sourceUrl;
 const selected=p.previewImage?.sourceUrl,pair=p.originalImages?.find(g=>(g.url===selected||g.thumbnail===selected)&&(!g.selectedSku||String(g.selectedSku)===String(p.sku))&&(!p.variantId||!g.variantId||String(g.variantId)===String(p.variantId)));
 return pair?.url||p.originalImageUrl||selected;
}
export function nativeImageCandidates(p,item){
 const source=nativeSourceUrl(p,item);
 const candidates=[];const gallery=p.originalImages?.find(g=>g.url===source&&(!g.selectedSku||String(g.selectedSku)===String(p.sku)));if(gallery?.nativeCachePath)candidates.push(gallery.nativeCachePath);
 // A cached thumbnail never qualifies as a native original. Only the exact
 // source-bound original mirror may replace a remote source image.
 if(source===p.originalImageEvidence?.sourceUrl&&p.originalCachedImageUrl)candidates.push(p.originalCachedImageUrl);
 if(p.displayImage?.nativeCachePath&&source===p.displayImage.sourceUrl)candidates.push(p.displayImage.nativeCachePath);
 if(source)candidates.push(source);
 return [...new Set(candidates)];
}
