import {createHash} from 'node:crypto';
import {bqAsset,bqImageKey} from './bq-images.mjs';
import {bqFingerprint} from './bq-products.mjs';

// Small, exact-photo review amendments remain independent of large concurrent
// collector caches. A newer source image or a changed product invalidates them.
export function applyBqReviewedAmendments(products,{index,visual,reviews,selections},amendments={}) {
  let applied=0;
  for(const p of products) {
    const a=amendments[p.sku];
    const prior=reviews[p.sku];if(prior?.sourceFingerprint===a?.sourceFingerprint&&Date.parse(prior.reviewedAt)>Date.parse(a.review?.reviewedAt))continue;
    if(!a||a.sourceFingerprint!==bqFingerprint(p))continue;
    const gallery=[...new Set(p.originalImages.map(g=>bqAsset(g.url)))];
    if(!gallery.includes(a.asset)||a.galleryFingerprint!==createHash('sha256').update(JSON.stringify(gallery)).digest('hex'))continue;
    const key=bqImageKey(a.asset),current=index[key];
    if(current?.sha256!==a.index.sha256&&Date.parse(current?.checkedAt)>Date.parse(a.index.checkedAt))continue;
    if(a.visual.imageHash!==a.index.sha256||a.review.imageHash!==a.index.sha256||!a.index.width||!a.index.height)throw Error('Invalid bound B&Q photo review');
    index[key]=current?.sha256===a.index.sha256&&Date.parse(current.checkedAt)>Date.parse(a.index.checkedAt)?current:{...a.index};visual[key]={...a.visual};
    // An old source version's colours/exclusion/gallery rejection must not be
    // promoted into fresh evidence merely by merging in a new fingerprint.
    reviews[p.sku]={...a.review};
    selections[p.sku]={...a.selection};applied++;
  }
  return applied;
}
