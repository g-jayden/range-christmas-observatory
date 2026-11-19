import {validProductImage} from './details.mjs';
import {nativeSourceUrl} from '../web/product-facts.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
export function rangeNativeTargets(products){const targets=new Map();for(const p of products){if(p.taxonomyAudit?.disposition!=='include')continue;const url=nativeSourceUrl(p),gallery=p.originalImages?.find(g=>g.url===url&&exactNativeGalleryMember(p,g));if(gallery&&validProductImage(url)&&!targets.has(url))targets.set(url,{sku:p.sku,sourceUrl:p.sourceUrl,variantImageUrl:url});}return targets;}
export function committedNativeMirror(entry,trackedFiles){return entry?.ok===true&&entry.width>=64&&entry.height>=64&&/^[a-f0-9]{64}$/.test(entry.hash||'')&&new RegExp('^images/source/'+entry.hash+'\\.(?:jpg|png|webp|avif|gif)$').test(entry.cachedImageUrl||'')&&trackedFiles.has('web/'+entry.cachedImageUrl);}
