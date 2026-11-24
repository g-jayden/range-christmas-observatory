import{detailFingerprint}from'./collection-policy.mjs';
import{exactNativeGalleryMember}from'./native-gallery-identity.mjs';
// A visual exclusion applies only to the same offered SKU, variant, title and
// source listing photo. Changes invalidate it before any collection is skipped.
export function springReviewExcludes(p,review){return review?.disposition==='exclude'&&Boolean(review.reason)&&/^[a-f0-9]{64}$/.test(review.imageHash||'')&&review.listingFingerprint===detailFingerprint(p)&&review.reviewedSourceImageUrl===p.listingVariantImageUrl&&(!review.sourceContentHash||review.sourceContentHash===p.detailEvidence?.sourceContentHash);}
export function springReviewedFamilyReferences(p,review){
 if(review?.disposition!=='include'||!review.reviewArtifact||review.sourceContentHash!==p.detailEvidence?.sourceContentHash||review.imageHash!==p.originalImageEvidence?.sha256||!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku))return[];
 return(review.sourceFamilyReferences||[]).filter(r=>r.reason&&r.url!==p.originalImageEvidence.sourceUrl&&p.originalImages?.some(g=>g.url===r.url&&exactNativeGalleryMember(p,g))).map(r=>({url:r.url,reason:r.reason,method:'human-exact-SKU-botanical-gallery-contents-review',reviewArtifact:review.reviewArtifact,sourceContentHash:review.sourceContentHash}));
}
