import {createHash} from 'node:crypto';
import {bqAsset,bqImageKey} from './bq-images.mjs';
import {bqFingerprint} from './bq-products.mjs';

// Small, exact-photo review amendments remain independent of large concurrent
// collector caches. A newer source image or a changed product invalidates them.
export function applyBqReviewedAmendments(products,{index,visual,reviews,selections},amendments={}) {
  let applied=0;
  for(const p of products) {
    const a=amendments[p.sku];
    const prior=reviews[p.sku];if(a&&prior&&prior.sourceFingerprint===a.sourceFingerprint&&Date.parse(prior.reviewedAt)>Date.parse(a.review?.reviewedAt))continue;
    if(!a||a.sourceFingerprint!==bqFingerprint(p))continue;
    const gallery=[...new Set(p.originalImages.map(g=>bqAsset(g.url)))];
    if(!gallery.includes(a.asset)||a.galleryFingerprint!==createHash('sha256').update(JSON.stringify(gallery)).digest('hex'))continue;
    const key=bqImageKey(a.asset),current=index[key];
    if(a.referenceCurrentEvidence===true&&(!current||current.error||current.sha256!==a.index.sha256||visual[key]?.imageHash!==a.index.sha256||current.width!==a.index.width||current.height!==a.index.height))continue;
    if(current?.sha256!==a.index.sha256&&Date.parse(current?.checkedAt)>Date.parse(a.index.checkedAt))continue;
    if(a.visual.imageHash!==a.index.sha256||a.review.imageHash!==a.index.sha256||!a.index.width||!a.index.height)throw Error('Invalid bound B&Q photo review');
    const extra=a.galleryEvidenceUpdates||[];
    if(!Array.isArray(extra)||extra.length>gallery.length||new Set(extra.map(g=>g.asset)).size!==extra.length)throw Error('Invalid B&Q gallery evidence updates');
    let staleGallery=false;
    for(const update of extra){
      const hash=update.index?.sha256,inspected=[...(a.review.sourceImageConflict?.galleryQuarantine?.images||[]),...(a.review.rejectedGallery||[]).map(g=>({asset:bqAsset(g.url),imageHash:g.imageHash})),...(a.review.dimensionSourceConflict?.selectedSku===String(p.sku)?a.review.dimensionSourceConflict.images||[]:[]).map(g=>({asset:bqAsset(g.url),imageHash:g.imageHash}))];
      if(!gallery.includes(update.asset)||update.asset===a.asset||!/^[a-f0-9]{64}$/.test(hash||'')||update.visual?.imageHash!==hash||!Number.isSafeInteger(update.index.width)||!Number.isSafeInteger(update.index.height)||update.index.width<32||update.index.height<32||!Number.isFinite(Date.parse(update.index.checkedAt))||!inspected.some(g=>g.asset===update.asset&&g.imageHash===hash))throw Error('Unbound B&Q inspected gallery pixels');
      const saved=index[bqImageKey(update.asset)];if(saved?.sha256!==hash&&Date.parse(saved?.checkedAt)>Date.parse(update.index.checkedAt))staleGallery=true;
    }
    if(staleGallery)continue;
    if(a.referenceCurrentEvidence!==true){index[key]=current?.sha256===a.index.sha256&&Date.parse(current.checkedAt)>Date.parse(a.index.checkedAt)?current:{...a.index};visual[key]={...a.visual};}
    for(const update of extra){const k=bqImageKey(update.asset),saved=index[k];index[k]=saved?.sha256===update.index.sha256&&Date.parse(saved.checkedAt)>Date.parse(update.index.checkedAt)?saved:{...update.index};visual[k]={...update.visual};}
    // An old source version's colours/exclusion/gallery rejection must not be
    // promoted into fresh evidence merely by merging in a new fingerprint.
    reviews[p.sku]={...a.review};
    selections[p.sku]={...a.selection};applied++;
  }
  return applied;
}
