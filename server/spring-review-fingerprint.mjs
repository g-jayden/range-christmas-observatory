import{createHash}from'node:crypto';
import{springSourceText}from'../web/spring-source-facts.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
// Identity covers source facts and original gallery, excluding fresh price,
// stock and observation times, which do not change botanical classification.
export function springReviewFingerprint(p){
 if(!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku))return null;
 const x=p.detailEvidence.exactVariantSource;
 return createHash('sha256').update(JSON.stringify(canonical({sku:String(p.sku),variantId:String(p.variantId),sourceUrl:p.sourceUrl,listingVariantImageUrl:p.listingVariantImageUrl,name:p.name,variantName:p.variantName,brand:p.brand,text:springSourceText(p),familyDescription:p.sourceDescription,summary:p.productSummary,features:p.features,specifications:p.specifications,sourceColour:p.sourceColour,sourceMaterial:p.sourceMaterial,exact:x?{selectedSku:x.selectedSku,variantId:x.variantId,sourceUrl:x.sourceUrl,jsonSource:x.jsonSource,description:x.description,features:x.features,descriptionOverride:x.descriptionOverride}:null,gallery:(p.originalImages||[]).filter(g=>!g.listingEvidence).map(g=>[g.url,g.thumbnail,g.selectedSku,g.variantId]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))}))).digest('hex');
}
export function revalidateSpringReviews(snapshot,reviews){
 const audit={unchanged:0,revalidated:0,changed:0,sourceRequests:0,firecrawlCredits:0};
 for(const p of snapshot.products||[]){const r=reviews.products?.[p.sku];if(!r||!r.reviewArtifact||!r.reason)continue;const fingerprint=springReviewFingerprint(p);if(!fingerprint)continue;
  if(r.sourceContentHash===p.detailEvidence.sourceContentHash){r.sourceFactsFingerprint||=fingerprint;audit.unchanged++;continue;}
  if(r.sourceFactsFingerprint!==fingerprint){audit.changed++;continue;}
  r.sourceRevalidations=[...(r.sourceRevalidations||[]),{previousSourceContentHash:r.sourceContentHash,sourceContentHash:p.detailEvidence.sourceContentHash,sourceFactsFingerprint:fingerprint,observedAt:p.attributeObservedAt||snapshot.observedAt}].slice(-5);r.sourceContentHash=p.detailEvidence.sourceContentHash;audit.revalidated++;
 }return audit;
}
