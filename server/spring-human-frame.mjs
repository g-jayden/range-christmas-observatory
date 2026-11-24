import {exactNativeGalleryMember} from './native-gallery-identity.mjs';

// A human inspection can correct a heuristic full-frame false negative, but
// only for the exact saved original and description that were inspected.
export function springHumanFrameAudit(p,review){
 const native=p.originalImageEvidence;
 if(review?.disposition!=='include'||review.wholeProductFrame!==true||!review.reviewArtifact||!review.reason)return null;
 if(!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku)||review.sourceContentHash!==p.detailEvidence.sourceContentHash)return null;
 if(!native?.sha256||review.imageHash!==native.sha256||!p.originalImages?.some(g=>g.url===native.sourceUrl&&exactNativeGalleryMember(p,g)&&(g.variantId==null||String(g.variantId)===String(p.variantId))))return null;
 if(p.previewImage?.sourceUrl&&p.previewImage.sourceUrl!==native.sourceUrl)return null;
 return{...p.previewAudit,status:'kept',issues:[],method:'human-exact-native-whole-product-frame',automatedAudit:p.previewAudit?.automatedAudit||{status:p.previewAudit?.status,issues:p.previewAudit?.issues||[]},humanReview:{imageHash:review.imageHash,sourceContentHash:review.sourceContentHash,artifact:review.reviewArtifact,reviewedAt:review.reviewedAt}};
}
