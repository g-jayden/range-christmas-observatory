import{createHash}from'node:crypto';
import{springReviewFingerprint,revalidateSpringReviews}from'./spring-review-fingerprint.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const authorityHash=r=>createHash('sha256').update(JSON.stringify(canonical(r))).digest('hex');

export function effectiveSpringReviews(snapshot,authored,bindings={}){
 const bound=boundSpringReviews(snapshot,authored,bindings);
 return {...bound,revalidation:revalidateSpringReviews(snapshot,bound.reviews)};
}

// Machine metadata never rewrites the human decision file. A binding applies
// only to the exact authored record and unchanged current product facts.
export function boundSpringReviews(snapshot,authored,bindings={}){
 const reviews=JSON.parse(JSON.stringify(authored)),products=new Map((snapshot.products||[]).map(p=>[String(p.sku),p]));let applied=0;
 for(const[sku,b]of Object.entries(bindings.products||{})){const r=reviews.products?.[sku],p=products.get(sku);if(!r||!p||b.authorityHash!==authorityHash(r)||!b.sourceContentHash||!b.sourceFactsFingerprint||springReviewFingerprint(p)!==b.sourceFactsFingerprint||r.sourceFactsFingerprint&&r.sourceFactsFingerprint!==b.sourceFactsFingerprint)continue;
  r.sourceContentHash=b.sourceContentHash;r.sourceFactsFingerprint=b.sourceFactsFingerprint;applied++;
 }
 return{reviews,audit:{applied,authoritativeRecordsChanged:0,sourceRequests:0,firecrawlCredits:0}};
}
export function springReviewBindings(snapshot,authored,effective){
 const products={};for(const[sku,r]of Object.entries(effective.products||{})){const original=authored.products?.[sku];if(!original||!r.reviewArtifact||!r.reason||!r.sourceContentHash||!r.sourceFactsFingerprint)continue;products[sku]={authorityHash:authorityHash(original),sourceContentHash:r.sourceContentHash,sourceFactsFingerprint:r.sourceFactsFingerprint};}
 return{version:1,sourceObservedAt:snapshot.observedAt,products};
}
