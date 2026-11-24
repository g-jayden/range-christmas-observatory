import {validProductImage} from './details.mjs';
import {nativeSourceUrl} from '../web/product-facts.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import{createHash}from'node:crypto';
export function rangeNativeTargets(products,{includeGallery=false}={}){const targets=new Map();for(const p of products){const spring=p.collectionId==='spring'&&p.springAudit?.disposition==='include'&&p.detailsReady===true&&p.detailEvidence?.verifiedProductSection===true&&String(p.detailEvidence.selectedSku)===String(p.sku);if(p.taxonomyAudit?.disposition!=='include'&&!spring||p.sourceImageConflict)continue;
 const selected=nativeSourceUrl(p),rejected=new Set([...(p.galleryRejections||[]),...(p.sourceFamilyReferenceImages||[])].map(g=>(g.url||g.sourceUrl||'').split('?')[0])),equivalent=p.identicalPhotoOriginalEvidence,urls=[selected,...(includeGallery?(p.originalImages||[]).map(g=>g.url):[])];
 for(const url of new Set(urls)){const gallery=p.originalImages?.find(g=>g.url===url&&exactNativeGalleryMember(p,g));if(!gallery||!validProductImage(url)||new URL(url).hostname!=='www.therange.co.uk'||rejected.has(url.split('?')[0])||equivalent?.comparison?.equivalent===true&&url===equivalent.rootUrl||targets.has(url))continue;
 const expected=p.originalImageEvidence?.sourceUrl===url?p.originalImageEvidence:gallery.nativeSha256?{sourceUrl:url,selectedSku:p.sku,sha256:gallery.nativeSha256,width:gallery.sourceWidth||gallery.width,height:gallery.sourceHeight||gallery.height}:null;
 targets.set(url,{sku:p.sku,variantId:p.variantId,sourceUrl:p.sourceUrl,variantImageUrl:url,originalImageUrl:url,originalImages:[gallery],...(gallery.nativeCachePath?{originalCachedImageUrl:gallery.nativeCachePath}:{}),...(expected?{originalImageEvidence:expected}:{}),expectedNative:expected});
 }}return targets;}
export function validateRangeNativeEntry(target,e){if(!e?.ok||e.url!==target.variantImageUrl||!/^[a-f0-9]{64}$/.test(e.hash||'')||!e.cachedImageUrl?.includes(e.hash+'.')||!(e.width>=64&&e.height>=64))throw Error('Exact native response proof missing');const expected=target.expectedNative;if(expected?.width&&e.width!==expected.width||expected?.height&&e.height!==expected.height||expected?.sha256&&e.hash!==expected.sha256)throw Object.assign(Error('Exact original pixels changed; source recheck required'),{code:'NATIVE_SOURCE_VERSION_CHANGED'});return e;}
export function committedNativeMirror(entry,trackedFiles){return entry?.ok===true&&entry.width>=64&&entry.height>=64&&/^[a-f0-9]{64}$/.test(entry.hash||'')&&new RegExp('^images/source/'+entry.hash+'\\.(?:jpg|png|webp|avif|gif)$').test(entry.cachedImageUrl||'')&&trackedFiles.has('web/'+entry.cachedImageUrl);}

// Recover a new offer's complete exact gallery before old baseline frames.
// This only reorders existing requests; it never adds a product or image URL.
export function prioritiseRangeNativeArrivals(pending,products,newSkus){
 const arrivals=products.filter(p=>newSkus.has(String(p.sku))),main=rangeNativeTargets(arrivals),gallery=rangeNativeTargets(arrivals,{includeGallery:true}),rank=p=>main.has(p.variantImageUrl)?2:gallery.has(p.variantImageUrl)?1:0;
 return [...pending].sort((a,b)=>rank(b)-rank(a));
}

// A data-only Git publication can merge another collector's successful frames
// into the working-copy index while this process still holds an older object.
// Reuse only committed, exact-response proofs before saving the next batch.
export function mergeCommittedRangeNativeEntries(current,checkpoint,targets,tracked){
 const merged={...current};
 for(const[url,e]of Object.entries(checkpoint||{})){
  if(!committedNativeMirror(e,tracked))continue;
  try{if(new URL(url).origin!=='https://www.therange.co.uk'||!validProductImage(url))continue;validateRangeNativeEntry(targets.get(url)||{variantImageUrl:url},e);}catch{continue;}
  const prior=merged[url];if(!prior){merged[url]=e;continue;}
  try{validateRangeNativeEntry(targets.get(url)||{variantImageUrl:url},prior);}catch{merged[url]=e;continue;}
  if(prior.hash!==e.hash||prior.width!==e.width||prior.height!==e.height||Number.isFinite(prior.bytes)&&Number.isFinite(e.bytes)&&prior.bytes!==e.bytes)throw Error('Concurrent native image pixels changed; source review required: '+url);
  const latest=Date.parse(e.observedAt||0)>Date.parse(prior.observedAt||0)?e:prior,bindings=[...new Set([...(prior.bindings||[]),...(e.bindings||[])])].sort(),selectedSkus=[...new Set([...(prior.selectedSkus||[]),...(e.selectedSkus||[])])].sort();
  merged[url]={...latest,...(Number.isFinite(prior.bytes??e.bytes)?{bytes:prior.bytes??e.bytes}:{}),...(bindings.length?{bindings}:{}),...(selectedSkus.length?{selectedSkus}:{})};
 }return merged;
}

export async function verifiedCheckpointNativeEntries(targets,checkpoint,{existing={},readOriginal}={}){
 const entries={},rejected=[];for(const[url,e]of Object.entries(checkpoint||{})){const target=targets.get(url);if(!target)continue;try{if(existing[url])try{validateRangeNativeEntry(target,existing[url]);continue;}catch{}validateRangeNativeEntry(target,e);if(!/^images\/source\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|avif)$/.test(e.cachedImageUrl||''))throw Error('Unverified native checkpoint path');const bytes=await readOriginal(e.cachedImageUrl);if(createHash('sha256').update(bytes).digest('hex')!==e.hash||Number.isFinite(e.bytes)&&bytes.length!==e.bytes)throw Error('Native checkpoint bytes changed');entries[url]=e;}catch(error){rejected.push({url,error:String(error.message).slice(0,180)});}}
 return{entries,rejected};
}
