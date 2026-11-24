import {bqFingerprint} from './bq-products.mjs';

// A supplier can attach another colour's photo to an otherwise valid SKU.
// Keep the source listing visible, but do not turn that mismatch into a
// price-labelled image or a supposedly verified new-product report.
export function applyBqSourceImageConflict(product,review,currentImageHash){
  delete product.sourceImageConflict;
  delete product.sourcePhotoQuarantined;
  const conflict=review?.sourceImageConflict;
  if(conflict&&review.sourceFingerprint===bqFingerprint(product)&&review.imageHash===currentImageHash){
    product.sourceImageConflict={...conflict,sourceFingerprint:review.sourceFingerprint,imageHash:currentImageHash};
    if(conflict.galleryQuarantine)product.sourcePhotoQuarantined=true;
  }
}
