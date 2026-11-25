import{detailFingerprint}from'./collection-policy.mjs';
import{exactNativeGalleryMember}from'./native-gallery-identity.mjs';
const arrival=p=>p.everNew&&p.arrivalEvidence==='observed-after-baseline'&&Number.isFinite(Date.parse(p.firstNewObservedAt));
export const springPendingArrival=p=>arrival(p)&&p.springAudit?.disposition!=='exclude'&&(!p.detailsReady||!p.springNativePhotoVerified||p.springAudit?.disposition!=='include');
export function springDailyDetailPlan(previous,candidates){
 const prior=new Map((previous.products||[]).map(p=>[String(p.sku),p]));
 return candidates.filter(p=>{const old=prior.get(String(p.sku));return !old||detailFingerprint(old)!==detailFingerprint(p)||arrival(p)&&(!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku));});
}
const galleryFor=p=>(p.originalImages||[]).filter(g=>exactNativeGalleryMember(p,g)&&String(g.variantId)===String(p.variantId));
export function selectSpringNativeImageTargets(products){
 let selected=0;
 for(const p of products){
  const gallery=galleryFor(p),preferred=p.previewImage?.sourceUrl||p.originalImageEvidence?.sourceUrl,g=gallery.find(g=>g.url===preferred)||gallery.find(g=>g.thumbnail===p.listingVariantImageUrl)||gallery.find(g=>g.url===p.originalImageUrl);
  if(!g)continue;
  if(p.variantImageUrl!==g.url){p.variantImageUrl=g.url;selected++;}
 }
 return selected;
}
export function retainSpringNativeImageEvidence(products){
 let retained=0;
 for(const p of products){const e=p.imageCacheEvidence;if(!e||!galleryFor(p).some(g=>g.url===e.sourceUrl)||!/^[a-f0-9]{64}$/.test(e.sha256||'')||!(e.width>=64&&e.height>=64)||!new RegExp('^images/source/'+e.sha256+'\\.[a-z0-9]+$').test(p.cachedImageUrl||''))continue;p.originalImageUrl=e.sourceUrl;p.originalCachedImageUrl=p.cachedImageUrl;p.originalImageEvidence={...e};retained++;}
 return retained;
}
