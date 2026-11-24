import {createHash} from 'node:crypto';
import {validProductImage} from './details.mjs';

// A broken PDP does not erase the image explicitly supplied on the exact
// official SKU directory row. Keep this distinct from a verified PDP gallery.
export function bindRangeDirectoryNative(snapshot){
 const audit={bound:0,rejected:0,sourceRequests:0,firecrawlCredits:0};
 if(snapshot?.baselineReady!==true||!Number.isFinite(Date.parse(snapshot.observedAt))||!Array.isArray(snapshot.products))return audit;
 const counts=new Map();for(const p of snapshot.products)counts.set(String(p.sku),(counts.get(String(p.sku))||0)+1);
 for(const p of snapshot.products){
  if(p.detailsReady===true||p.originalImages?.length)continue;
  const sku=String(p.sku||''),url=p.variantImageUrl;
  let page;try{page=new URL(p.sourceUrl);}catch{continue;}
  if(!/^\d{1,12}$/.test(sku)||counts.get(sku)!==1||p.variantId==null||!p.variantName||page.origin!=='https://www.therange.co.uk'||page.hash.slice(1)!==sku||!url||!validProductImage(url)||p.listingVariantImageUrl&&p.listingVariantImageUrl!==url){audit.rejected++;continue;}
  const proof={selectedSku:sku,variantId:String(p.variantId),sourceUrl:p.sourceUrl,sourceImageUrl:url,observedAt:snapshot.observedAt,method:'exact-official-SKU-directory-row-image-PDP-gallery-unavailable'};
  proof.sha256=createHash('sha256').update(JSON.stringify(proof)).digest('hex');
  p.directoryImageEvidence=proof;p.originalImages=[{url,selectedSku:sku,variantId:String(p.variantId),sourceUrl:p.sourceUrl,listingEvidence:proof,verification:proof.method}];audit.bound++;
 }
 return audit;
}
