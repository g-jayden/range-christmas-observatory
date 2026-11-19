import {createHash} from 'node:crypto';
import {productRetailer} from '../web/product-facts.mjs';
const hash=p=>p.originalImageEvidence?.sha256||p.displayImage?.sha256||p.previewImage?.sha256||p.imageCacheEvidence?.sha256;
export const identityReviewFingerprint=p=>createHash('sha256').update(JSON.stringify([String(p.sku),p.variantName,p.sourceDescription||'',p.specifications||{},p.material,p.colorValues,p.dimensions?.values,(p.originalImages||[]).map(g=>[g.url,String(g.selectedSku??g.variantId??'')]),hash(p)])).digest('hex');
export function applyCatalogueIdentityReviews(index,products,reviews={}){
 const byKey=new Map(products.map(p=>[productRetailer(p)+':'+p.sku,p])),parent=new Map,applied=[];
 const root=k=>{let r=k;while(parent.has(r))r=parent.get(r);return r;};
 for(const review of reviews.pairs||[]){const a=byKey.get(review.retailerId+':'+review.skus?.[0]),b=byKey.get(review.retailerId+':'+review.skus?.[1]);
  if(!a||!b||review.decision!=='merge-identical-physical-offer'||review.fingerprints?.[0]!==identityReviewFingerprint(a)||review.fingerprints?.[1]!==identityReviewFingerprint(b)||review.imageHashes?.[0]!==hash(a)||review.imageHashes?.[1]!==hash(b)||a.taxonomyAudit?.disposition==='exclude'||b.taxonomyAudit?.disposition==='exclude')continue;
  const x=root(productRetailer(a)+':'+a.sku),y=root(productRetailer(b)+':'+b.sku);if(x!==y)parent.set(y,x);applied.push(review);
 }
 const groups=new Map;for(const k of new Set([...parent.keys(),...parent.values()])){const r=root(k);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(byKey.get(k));}
 for(const rows of groups.values()){rows.sort((a,b)=>Number(b.inStock===true)-Number(a.inStock===true)||(a.priceGBP??Infinity)-(b.priceGBP??Infinity)||String(a.sku).localeCompare(String(b.sku)));const winner=rows[0],winnerKey=productRetailer(winner)+':'+winner.sku;if(rows.some(p=>String(p.sku)===index.canonical[winnerKey]))delete index.canonical[winnerKey];for(const p of rows)if(p!==winner)index.canonical[productRetailer(p)+':'+p.sku]=String(winner.sku);index.reviewedPhysicalGroups||=[];index.reviewedPhysicalGroups.push({retailerId:productRetailer(winner),canonicalSku:String(winner.sku),sourceSkus:rows.map(p=>String(p.sku)),method:'complete-source-gallery-and-exact-SKU-description-specifications-human-reviewed'});}
 index.reviewedDuplicatePairs=applied.length;return index;
}
