import {detailFingerprint} from './collection-policy.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {validSpringListingRecovery} from './spring-listing-recovery.mjs';

// Some official PDP JSON records omit their gallery. The complete catalogue
// still supplies an image on the exact SKU row. Preserve that evidence as a
// listing image, without claiming that a missing PDP gallery was retrieved.
export function bindSpringListingNativeImages(snapshot){
 if(!snapshot.source?.complete||snapshot.source.expected!==snapshot.products?.length)return{bound:0};
 const counts=new Map;for(const p of snapshot.products)counts.set(String(p.sku),(counts.get(String(p.sku))||0)+1);
 let bound=0,retiredListingFallbacks=0;
 for(const p of snapshot.products){
  // A catalogue thumbnail is only a fallback while the actual PDP gallery
  // is missing. Retire it once exact native anchors have been recovered;
  // otherwise an old human thumbnail choice can override the new originals.
  const native=(p.originalImages||[]).filter(g=>!g.listingEvidence&&exactNativeGalleryMember(p,g));
  if(native.length){
   const fallback=(p.originalImages||[]).filter(g=>g.listingEvidence);
   const retained=fallback.filter(g=>g.url===p.listingVariantImageUrl&&g.listingEvidence?.resolutionVerified===true&&g.listingEvidence.sha256===p.springListingImageRecovery?.sha256&&validSpringListingRecovery(p,snapshot));
   if(fallback.length){p.originalImages=[...native,...retained];retiredListingFallbacks+=fallback.length-retained.length;}
   if(![...native,...retained].some(g=>g.url===p.originalImageUrl)){
    p.originalImageUrl=native.find(g=>g.thumbnail===p.listingVariantImageUrl)?.url||native[0].url;
    delete p.originalCachedImageUrl;delete p.originalImageEvidence;delete p.previewImage;delete p.previewAudit;
   }
   continue;
  }
  const e=p.imageCacheEvidence,url=p.listingVariantImageUrl,exact=p.detailEvidence?.exactVariantSource;
  if(counts.get(String(p.sku))!==1||p.recordType!=='sku'||p.observedAt!==snapshot.observedAt||!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku)||String(exact?.variantId)!==String(p.variantId)||String(exact?.selectedSku)!==String(p.sku)||p.detailInputFingerprint!==detailFingerprint(p))continue;
  if(!url||e?.sourceUrl!==url||!e.sha256||!e.width||!e.height||!p.cachedImageUrl)continue;
  let u;try{u=new URL(url);}catch{continue;}if(u.protocol!=='https:'||!['www.therange.co.uk','kube-media-unpublished.rstore.com'].includes(u.hostname)||!u.pathname.startsWith('/media/'))continue;
  if(p.originalImages?.some(g=>g.url===url&&exactNativeGalleryMember(p,g)))continue;
  const proof={method:'official-exact-SKU-listing-native-image',sourceUrl:snapshot.source.url,rootCategoryId:snapshot.source.rootCategoryId||snapshot.source.id,selectedSku:String(p.sku),variantId:String(p.variantId),observedAt:p.observedAt};
  p.originalImages=[...(p.originalImages||[]),{url,selectedSku:String(p.sku),variantId:String(p.variantId),listingEvidence:proof}];
  if(!p.originalImageEvidence){p.originalImageUrl=url;p.originalCachedImageUrl=p.cachedImageUrl;p.originalImageEvidence={...e};p.originalSourceEvidence=proof;}
  bound++;
 }
 return{bound,retiredListingFallbacks,sourceRequests:0,firecrawlCredits:0};
}
