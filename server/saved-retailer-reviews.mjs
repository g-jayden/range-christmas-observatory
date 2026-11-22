import {createHash} from 'node:crypto';
import {ASDA_DEPARTMENTS} from '../web/asda-model.mjs';import {DU_DEPARTMENTS} from '../web/du-model.mjs';
export const retailerReviewFingerprint=p=>createHash('sha256').update(JSON.stringify([p.variantName,p.sourceDescription,p.specifications])).digest('hex');
export function matchesSavedReviewImage(product,review){
 const hash=review?.imageHash;
 return typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)&&hash===product.imageCacheEvidence?.sha256;
}
export function applySavedRetailerReview(product,review,id){
 const allowed=id==='asda'?ASDA_DEPARTMENTS:id==='du'?DU_DEPARTMENTS:[];
 if(!matchesSavedReviewImage(product,review)||review.sourceFingerprint!==retailerReviewFingerprint(product)||!allowed.some(d=>d.id===review.department))return false;
 product.department=review.department;product.departmentIds=[review.department];product.kind=review.department===id+'-tree'?'tree':review.department===id+'-skirt'?'skirt':'decoration';
 if(review.colors){product.colorValues=review.colors;product.treeColor=review.colors.join(' / ');}
 product.classificationEvidence={...product.classificationEvidence,requiresReview:false,savedImageReview:review,method:'verified-exact-SKU-source-description-and-current-photo-human-review'};return true;
}
