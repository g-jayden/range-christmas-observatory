import{detailFingerprint}from'./collection-policy.mjs';
// A visual exclusion applies only to the same offered SKU, variant, title and
// source listing photo. Changes invalidate it before any collection is skipped.
export function springReviewExcludes(p,review){return review?.disposition==='exclude'&&Boolean(review.reason)&&/^[a-f0-9]{64}$/.test(review.imageHash||'')&&review.listingFingerprint===detailFingerprint(p)&&review.reviewedSourceImageUrl===p.listingVariantImageUrl;}
