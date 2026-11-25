import {bqFingerprint} from './bq-products.mjs';
import {bqAsset,bqImageKey} from './bq-images.mjs';

// A reviewed source disagreement is not a guessed replacement measurement.
// Keep the raw specification and show both current authoritative readings.
export function applyBqReviewedDimensionConflict(p,review,index){
 const proof=review?.dimensionSourceConflict;
 if(!proof?.note||proof.selectedSku!==String(p.sku)||!proof.images?.length||review.sourceFingerprint!==bqFingerprint(p))return false;
 const member=new Set((p.originalImages||[]).map(g=>bqAsset(g.url))),matched=proof.images.every(g=>member.has(bqAsset(g.url))&&index[bqImageKey(g.url)]?.sha256===g.imageHash);
 const label=matched?proof.note:'官网尺寸依据已变化，待重新核对 · Official dimension evidence changed; current dimensions await review';
 p.dimensionSourceNote=label;p.dimensions={...p.dimensions,values:{},axes:[],maxCm:null,label,sourceConflict:{method:'exact-SKU-human-reviewed-source-specification-and-image-disagreement',note:label,currentImageEvidenceMatched:matched,images:proof.images}};p.heightCm=null;p.skirtSizeCm=null;return true;
}
