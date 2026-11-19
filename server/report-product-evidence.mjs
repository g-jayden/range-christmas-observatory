// Range's compact in-stock catalogue predates the other retailers' explicit
// inStock boolean. Its complete filtered directory and exact record membership
// are the stock evidence; a missing boolean is not an out-of-stock response.
export function reportProductEvidence(product,candidate,source,{retailerId}={}){
 const sku=String(product.sku),reasons=[];
 if(product.sourceUrl!==candidate.sourceUrl)reasons.push('source-URL-changed');
 const rangeStock=retailerId==='the-range'&&source?.sourceAudits?.some(a=>a.complete===true&&a.records?.some(s=>String(s)===sku)&&a.batches?.some(b=>{try{const u=new URL(b.url),filters=JSON.parse(u.searchParams.get('filters')||'{}');return filters.in_stock_f?.includes('true');}catch{return false;}}));
 if(product.inStock!==true&&!(product.inStock!==false&&rangeStock))reasons.push('current-in-stock-source-proof-missing');
 if(!product.detailsReady||!product.detailEvidence?.verifiedProductSection||String(product.detailEvidence.selectedSku)!==sku)reasons.push('exact-SKU-detail-proof-missing');
 if(!Number.isFinite(product.priceGBP)||product.priceGBP<0)reasons.push('current-price-missing');
 if(product.classificationEvidence?.requiresReview||product.taxonomyAudit?.disposition==='exclude')reasons.push('physical-classification-unaccepted');
 return {accepted:!reasons.length,reasons};
}
