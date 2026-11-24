import {detailFingerprint} from './collection-policy.mjs';
import {acceptedImageGallery} from './range-image-gallery.mjs';
export const SPRING_GALLERY_DECODER='sole-SKU-visible-and-structured-union-v1';
export function springGalleryRepairPlan(source,{request,patch,ordinaryTargets=[]}={}){
 const versioned=Boolean(request);
 if(versioned&&(request.version!==SPRING_GALLERY_DECODER||request.baseObservedAt!==source.observedAt||!Array.isArray(request.products)||!request.products.length))throw Error('Invalid or stale exact-SKU gallery repair scope');
 const by=new Map(source.products.map(p=>[String(p.sku),p]));
 const selected=versioned?request.products.map(r=>{const p=by.get(String(r.sku));if(!p?.detailsReady||String(r.variantId)!==String(p.variantId)||r.inputFingerprint!==detailFingerprint(p)||r.sourceContentHash!==p.detailEvidence?.sourceContentHash)throw Error('Gallery scope source facts changed: '+r.sku);return p;}):ordinaryTargets;
 if(new Set(selected.map(p=>String(p.sku))).size!==selected.length)throw Error('Duplicate gallery repair target');
 const hasProof=p=>(patch?.galleries||[]).some(r=>r.inputFingerprint===detailFingerprint(p)&&acceptedImageGallery(p,r)&&(!versioned||r.galleryDecoderVersion===SPRING_GALLERY_DECODER));
 return{versioned,hasProof,targets:selected.filter(p=>!hasProof(p))};
}
