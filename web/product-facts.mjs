import {productDimensions,treeHeightConflict} from './catalogue-model.mjs';
import {retailerForScope,retailerName} from './retailers.mjs';

export const productRetailer=p=>p.retailerId==='the-range-gb'?'the-range':p.retailerId||retailerForScope(p.department||p.kind);
export const productKey=p=>productRetailer(p)+':'+String(p.canonicalSku||p.sku);
export const productPrice=p=>Number.isFinite(p.priceGBP)?'£'+p.priceGBP.toFixed(2):'官网未标价 · Price not specified';
export function assertProductPhoto(p){
 if(p.sourceImageConflict)throw Error(p.sourceImageConflict.note||'官网标题与配图冲突 · Official title and photo disagree');
}
export function productSize(p){
 const checked=productDimensions(p.specifications||{});if(checked.sourceConflict)return checked.label;if(p.dimensions?.sourceConflict)return p.dimensions.label;
 const conflict=treeHeightConflict(p);
 if(conflict&&!conflict.usableHeightCm)return '官网尺寸冲突 · Conflicting source dimensions';
 if(conflict)return conflict.usableHeightCm+'cm';
 const d=p.dimensions?.label?p.dimensions:productDimensions(p.specifications||{});
 if(d.axes?.length)return d.label;
 const realSize=value=>value&&!/^(?:one(?: size)?|os|n\/?a|not (?:specified|available))$/i.test(String(value).trim());
 if(realSize(d.sourceSize))return d.categoryLabel||d.sourceSize;
 return [p.heightLabel,p.specifications?.Dimensions,p.specifications?.Size].find(realSize)||(p.skirtDiameterCm?p.skirtDiameterCm+'cm':'官网未注明尺寸 · Size not specified');
}
export const reportRetailer=p=>retailerName(productRetailer(p));
const usableNativeUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname!=='www.therange.co.uk'||!u.pathname.startsWith('/media/')||/\.(?:jpe?g|png|webp|gif|avif)$/i.test(u.pathname));}catch{return false;}};
export function nativeSourceUrl(p,item){
 if(item?.url)return usableNativeUrl(item.url)?item.url:null;
 if(p.displayImage?.sourceUrl&&usableNativeUrl(p.displayImage.sourceUrl))return p.displayImage.sourceUrl;
 const known=g=>(g.selectedSku!=null?String(g.selectedSku)===String(p.sku):p.variantId!=null&&String(g.variantId)===String(p.variantId)&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku))&&usableNativeUrl(g.url);
 const selected=p.previewImage?.sourceUrl,pair=p.originalImages?.find(g=>(g.url===selected||g.thumbnail===selected)&&known(g));
 if(pair)return pair.url;
 if(usableNativeUrl(p.originalImageUrl))return p.originalImageUrl;
 const current=p.variantImageUrl||p.imageCacheEvidence?.sourceUrl,matching=p.originalImages?.find(g=>(g.url===current||g.thumbnail===current)&&known(g));
 const fallback=matching||p.originalImages?.find(known);return fallback?.url||(usableNativeUrl(selected)?selected:null);
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
