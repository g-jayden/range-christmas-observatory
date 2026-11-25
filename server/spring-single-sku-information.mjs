import{parseVariantDetails}from'./details.mjs';

// Reuse a separately captured sole-SKU HTML/JSON pair only while every detail
// input is unchanged. This adds no sizes, prices, history or photo substitutions.
export function applySavedSingleSkuInformation(snapshot,proofs){
 const audit={applied:0,rejected:[],sourceRequests:0,firecrawlCredits:0};
 if(proofs?.version!==1)return audit;
 const by=new Map((snapshot.products||[]).map(p=>[String(p.sku),p]));
 for(const record of proofs.products||[]){
  const p=by.get(String(record.sku));
  try{
   if(!p?.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku)||String(record.variantId)!==String(p.variantId)||record.sourceUrl!==p.sourceUrl||record.sourceContentHash!==p.detailEvidence.sourceContentHash)throw Error('current exact-SKU source changed');
   const u=new URL(record.sourceUrl);if(u.origin!=='https://www.therange.co.uk'||u.username||u.password||u.port)throw Error('official source origin required');
   const d=parseVariantDetails(record.response,p.sku,p.sourceUrl),x=d.exactVariantSource,info=x.singleSkuPageInformation;
   if(!info||info.productId!==String(p.id)||x.variantId!==String(p.variantId)||d.contentHash!==p.detailEvidence.sourceContentHash||d.featuresText!==p.sourceDescription)throw Error('current detail or sole-SKU page proof changed');
   if(!Number.isFinite(Date.parse(x.observedAt)))throw Error('source observation required');
   // Existing raw specifications, details, prices, native bytes and dates stay
   // untouched. The exact page/variant provenance travels with the description.
   p.detailEvidence.exactVariantSource=x;audit.applied++;
  }catch(error){audit.rejected.push({sku:String(record.sku),reason:error.message});}
 }
 return audit;
}
