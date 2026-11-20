import {productDimensions,treeHeightConflict} from './catalogue-model.mjs';
import {retailerForScope,retailerName} from './retailers.mjs';

export const productRetailer=p=>p.retailerId==='the-range-gb'?'the-range':p.retailerId||retailerForScope(p.department||p.kind);
export const productKey=p=>productRetailer(p)+':'+String(p.canonicalSku||p.sku);
export const productPrice=p=>Number.isFinite(p.priceGBP)?'£'+p.priceGBP.toFixed(2):'官网未标价 · Price not specified';
export function assertProductPhoto(p){
 if(p.sourceImageConflict)throw Error(p.sourceImageConflict.note||'官网标题与配图冲突 · Official title and photo disagree');
}
export function componentSizeFacts(p){
 const text=String(p.sourceDescription||p.productSummary||'');
 const heading=text.search(/\b(?:set|pack)\s+(?:includes|contains)\s*:/i);
 if(heading<0&&!/\b(?:set|pack)\b/i.test(p.variantName||p.name||''))return null;
 const section=heading<0?text:text.slice(heading),parts=[];
 for(const m of section.matchAll(/(?<![\d.])(\d{1,4})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|inches?|ft)\s*(?=baubles?|balls?|ornaments?|decorations?|snowflakes?|stars?|garlands?|wreaths?)/ig)){
  if(Number(m[1])>0&&Number(m[2])>0)parts.push({quantity:Number(m[1]),measure:m[2]+m[3].toLowerCase(),source:m[0].trim()});
 }
 if(!parts.length)return null;
 return{values:{},axes:[],maxCm:null,componentSizes:parts,evidence:{source:'exact-SKU source description',excerpt:section.slice(0,500)},label:'已标注组件尺寸 · Specified component sizes: '+[...new Set(parts.map(p=>p.quantity+' × '+p.measure))].join(' / ')};
}
export function titleSizeFacts(p){
 const title=String(p.variantName||p.name||''),unit='(?:cm|mm|m|ft|feet|inches?)';
 if(new RegExp('\\d+(?:\\.\\d+)?\\s*(?:'+unit+')?\\s*[-–¿]\\s*\\d+(?:\\.\\d+)?\\s*'+unit+'\\b','i').test(title)||/\d\s*[x×]\s*\d/i.test(title))return null;
 const values=[...title.matchAll(/\b(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|feet|inches?)\b/ig)].map(m=>m[1]+m[2].toLowerCase()),unique=[...new Set(values)];
 if(unique.length!==1||!/^\d/.test(unique[0])||!(parseFloat(unique[0])>0))return null;
 return{values:{},axes:[],maxCm:null,evidence:{source:'exact-SKU official listing title',excerpt:title},label:'标题标注尺寸 · Size in source title: '+unique[0]};
}
export function productSize(p){
 const checked=productDimensions(p.specifications||{});if(checked.sourceConflict)return checked.label;if(p.dimensions?.sourceConflict)return p.dimensions.label;
 const conflict=treeHeightConflict(p);
 if(conflict&&!conflict.usableHeightCm){const titleValue=String(p.variantName||p.name||'').match(/\b\d+(?:\.\d+)?\s*(?:cm|mm|metres?|meters?|m|ft|feet|inches?|in)\b/i)?.[0]||conflict.titleHeightCm+'cm',other=checked.axes.filter(a=>a.key!=='Height').map(a=>a.label+' '+a.cm+'cm');return '官网尺寸冲突 · Conflicting source dimensions: 标题 · Title '+titleValue+' / 规格高度 · Source height '+conflict.sourceValue+(other.length?'；'+other.join(' × '):'');}
 if(conflict)return conflict.usableHeightCm+'cm';
 const d=p.dimensions?.label?p.dimensions:productDimensions(p.specifications||{});
 if(d.axes?.length)return d.label;
 const components=componentSizeFacts(p);if(components)return components.label;
 const realSize=value=>value&&!/^(?:one(?: size)?|os|n\/?a|not (?:specified|available))$/i.test(String(value).trim());
 if(realSize(d.sourceSize))return d.categoryLabel||d.sourceSize;
 const stated=titleSizeFacts(p);if(stated)return stated.label;
 return [p.heightLabel,p.specifications?.Dimensions,p.specifications?.Size].find(realSize)||(p.skirtDiameterCm?p.skirtDiameterCm+'cm':'官网未注明尺寸 · Size not specified');
}
export const reportRetailer=p=>retailerName(productRetailer(p));
const usableNativeUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname!=='www.therange.co.uk'||!u.pathname.startsWith('/media/')||/\.(?:jpe?g|png|webp|gif|avif)$/i.test(u.pathname));}catch{return false;}};
export function nativeSourceUrl(p,item){
 if(item?.url)return usableNativeUrl(item.url)?item.url:null;
 const known=g=>(g.selectedSku!=null?String(g.selectedSku)===String(p.sku):p.variantId!=null&&String(g.variantId)===String(p.variantId)&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku))&&usableNativeUrl(g.url);
 const selected=p.displayImage?.sourceUrl||p.previewImage?.sourceUrl,pair=p.originalImages?.find(g=>(g.url===selected||g.thumbnail===selected)&&known(g));
 if(pair)return pair.url;
 if(usableNativeUrl(p.originalImageUrl))return p.originalImageUrl;
 const current=p.variantImageUrl||p.imageCacheEvidence?.sourceUrl,matching=p.originalImages?.find(g=>(g.url===current||g.thumbnail===current)&&known(g));
 const fallback=matching||p.originalImages?.find(known);return fallback?.url||(usableNativeUrl(selected)?selected:null);
}

export function nativeDownloadUrl(p,source=nativeSourceUrl(p)){
 if(productRetailer(p)!=='bq'||!source)return source;
 const declared=p.originalImageEvidence,exported=p.nativeExportEvidence;
 if(declared?.sourceUrl!==source||!Number.isInteger(declared.width)||!Number.isInteger(declared.height)||declared.width<64||declared.height<64||declared.sourceVersion==null||!p.originalImages?.some(g=>g.url===source&&String(g.selectedSku)===String(p.sku)))return source;
 const u=new URL(source);if(u.origin!=='https://media.diy.com'||!/^\/is\/image\/(?:Kingfisher|KingfisherDigital)\//.test(u.pathname))return source;
 if(exported?.sourceUrl===source&&String(exported.selectedSku)===String(p.sku)&&exported.sourceVersion===declared.sourceVersion&&exported.width===declared.width&&exported.height===declared.height){const e=new URL(exported.exportUrl);if(e.origin===u.origin&&e.pathname===u.pathname&&Number(e.searchParams.get('wid'))===declared.width&&Number(e.searchParams.get('hei'))===declared.height&&e.searchParams.get('fit')==='fit,0')return e.href;}
 if(declared.sha256)return source;
 u.search=new URLSearchParams({wid:String(declared.width),hei:String(declared.height),fit:'fit,0',fmt:'jpg',qlt:'100'});u.hash='';return u.href;
}
export function nativeImageCandidates(p,item){
 const source=nativeSourceUrl(p,item);
 const candidates=[];const gallery=p.originalImages?.find(g=>g.url===source&&(!g.selectedSku||String(g.selectedSku)===String(p.sku)));
 const accelerated=p.browseNative,bound=[p.nativeExportEvidence,p.originalImageEvidence,gallery&&{...gallery,sourceUrl:gallery.url,sha256:gallery.sha256||gallery.nativeSha256}].find(e=>e?.sourceUrl===source&&(!e.selectedSku||String(e.selectedSku)===String(p.sku))&&/^[a-f0-9]{64}$/.test(e.sha256||''));
 if(accelerated?.sourceUrl===source&&bound?.sha256===accelerated.sha256&&new RegExp('^native-first/'+accelerated.sha256+'\\.(?:jpe?g|png|webp|avif)$','i').test(accelerated.url||''))candidates.push(accelerated.url);
 if(gallery?.nativeCachePath)candidates.push(gallery.nativeCachePath);
 // A cached thumbnail never qualifies as a native original. Only the exact
 // source-bound original mirror may replace a remote source image.
 if(source===p.originalImageEvidence?.sourceUrl&&p.originalCachedImageUrl)candidates.push(p.originalCachedImageUrl);
 if(p.displayImage?.nativeCachePath&&source===p.displayImage.sourceUrl)candidates.push(p.displayImage.nativeCachePath);
 if(source)candidates.push(nativeDownloadUrl(p,source),source);
 return [...new Set(candidates)];
}
