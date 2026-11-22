import{createHash}from'node:crypto';
export function clearArReviewProjection(p){if(p.sourceConsistency?.method==='exact-source-and-image-bound-visual-conflict-review'){if(p.sourceImageConflict?.reviewId==='ar-source-consistency-20261123')delete p.sourceImageConflict;delete p.sourceConsistency;}}
export function applyArSourceConflict(p,review){
 if(!review||review.selectedSku!==p.sku||review.sourceUrl!==p.sourceUrl||review.expectedTitle!==p.variantName||review.descriptionSha256!==createHash('sha256').update(p.sourceDescription||'').digest('hex')||review.imageSha256!==p.imageCacheEvidence?.sha256)return false;
 p.sourceImageConflict={note:review.reason,reviewId:'ar-source-consistency-20261123',imageSha256:review.imageSha256,selectedSku:p.sku};p.sourceConsistency={state:'source-conflict',kind:review.kind,selectedSku:p.sku,sourceUrl:p.sourceUrl,imageSha256:review.imageSha256,reviewedAt:review.reviewedAt,method:'exact-source-and-image-bound-visual-conflict-review',currentDataRetained:true,pricedImageExportBlocked:true};return true;
}
