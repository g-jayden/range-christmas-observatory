import {bqFingerprint} from './bq-products.mjs';
import {createHash} from 'node:crypto';
import {bqAsset} from './bq-images.mjs';

// A supplier can attach another colour's photo to an otherwise valid SKU.
// Keep the source listing visible, but do not turn that mismatch into a
// price-labelled image or a supposedly verified new-product report.
export function applyBqSourceImageConflict(product,review,currentImageHash){
  delete product.sourceImageConflict;
  delete product.sourcePhotoQuarantined;
  const conflict=review?.sourceImageConflict;
  const proof=conflict?.galleryQuarantine,gallery=[...new Set((product.originalImages||[]).map(g=>bqAsset(g.url)))];
  const knownQuarantinedAngle=proof?.state==='all-source-photos-mismatch'&&proof.galleryFingerprint===createHash('sha256').update(JSON.stringify(gallery)).digest('hex')&&proof.images?.length===gallery.length&&new Set(proof.images.map(g=>g.asset)).size===gallery.length&&proof.images.every(g=>gallery.includes(g.asset)&&/^[a-f0-9]{64}$/.test(g.imageHash||''))&&product.originalImageUrl&&proof.images.some(g=>g.asset===bqAsset(product.originalImageUrl)&&g.imageHash===currentImageHash);
  if(conflict&&review.sourceFingerprint===bqFingerprint(product)&&(review.imageHash===currentImageHash||knownQuarantinedAngle)){
    product.sourceImageConflict={...conflict,sourceFingerprint:review.sourceFingerprint,imageHash:currentImageHash};
    if(conflict.galleryQuarantine)product.sourcePhotoQuarantined=true;
  }
}
