import {parseDetails,applyDetails} from './details.mjs';
import {applyRangeNativeIndex} from './range-native-index.mjs';
import {detailFingerprint} from './collection-policy.mjs';
const canonical=raw=>{try{const u=new URL(raw);return u.origin==='https://www.therange.co.uk'?u.origin+u.pathname.replace(/\/$/,''):null;}catch{return null;}};
export function applyRangeResidualEvidence(snapshots,pack,{now=Date.now()}={}){
 const report={applied:[],dimensionReviews:[],skipped:[],sourceRequests:0,firecrawlCredits:0};
 if(!pack)return report;if(pack.version!==1||pack.method!=='exact-SKU-official-source-and-manually-read-native-dimensions'||!Array.isArray(pack.records))throw Error('Invalid reviewed source evidence');
 for(const r of pack.records){const d=parseDetails(r.data,r.sku,r.sourceUrl),v=r.data.data.sourceVariant;
  if(!Number.isFinite(Date.parse(d.observedAt))||Date.parse(d.observedAt)>now+60000||String(v.id)!==String(r.expectedVariantId))throw Error('Invalid residual source identity or observation date');
  for(const s of snapshots)for(const p of s?.products||[]){if(String(p.sku)!==String(r.sku))continue;
   const newer=Date.parse(p.attributeObservedAt)>Date.parse(d.observedAt);
   if(canonical(p.sourceUrl)!==canonical(r.sourceUrl)||String(p.variantId)!==String(r.expectedVariantId)||r.variantName!==p.variantName||newer&&p.detailEvidence?.sourceContentHash!==d.contentHash){report.skipped.push({sku:p.sku,reason:'changed-current-source-identity-or-newer-source'});continue;}
   const offer=JSON.stringify([p.priceGBP,p.newStatus,p.observedAt,p.firstNewObservedAt]);if(!newer)applyDetails(p,d);p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);delete p.detailIssue;delete p.detailError;
   const review=pack.dimensionReviews?.[p.sku];
   if(review){
    if(review.sku!==String(p.sku)||String(review.variantId)!==String(p.variantId)||review.sourceContentHash!==d.contentHash||review.title!==p.variantName||canonical(review.sourceUrl)!==canonical(p.sourceUrl)||!Number.isFinite(review.heightCm)||review.heightCm<=0)throw Error('Dimension review does not match the current exact source');
    if(review.method==='title-and-exact-SKU-native-dimension-diagram'){
     const g=p.originalImages?.find(g=>g.url===review.imageUrl&&String(g.variantId)===String(p.variantId)),e=pack.nativeEntries?.[review.imageUrl];
     if(!g||!e?.ok||e.hash!==review.imageSha256||e.width<1000||e.height<1000||review.readingRole!=='product-height')throw Error('Dimension review requires a bound native product-height diagram');
    }else if(review.method==='title-and-exact-SKU-description'){
     if(d.exactVariantSource?.description!==review.exactDescription||!review.exactDescription.includes(review.literal))throw Error('Dimension review requires the unchanged exact-SKU description');
    }else throw Error('Unsupported dimension corroboration');
    p.detailEvidence.dimensionReview={...review,verifiedEvidence:true};report.dimensionReviews.push({sku:p.sku,heightCm:review.heightCm,method:review.method});
   }
   if(JSON.stringify([p.priceGBP,p.newStatus,p.observedAt,p.firstNewObservedAt])!==offer)throw Error('Reviewed source recovery cannot rewrite offers or arrival history');
   report.applied.push({sku:p.sku,observedAt:d.observedAt});
  }
 }
 const index={entries:pack.nativeEntries||{}};for(const s of snapshots)applyRangeNativeIndex(s?.products||[],index);
 report.uniqueSkus=new Set(report.applied.map(r=>r.sku)).size;report.uniqueDimensionSkus=new Set(report.dimensionReviews.map(r=>r.sku)).size;return report;
}
