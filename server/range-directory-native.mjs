import {createHash} from 'node:crypto';
import {validProductImage} from './details.mjs';

// A broken PDP does not erase the image explicitly supplied on the exact
// official SKU directory row. Keep this distinct from a verified PDP gallery.
export function bindRangeDirectoryNative(snapshot){
 const audit={bound:0,rejected:0,sourceRequests:0,firecrawlCredits:0};
 const treeKeys=['pop-up-trees','slim-christmas-trees','potted-christmas-trees','artificial-trees','prelit-christmas-trees','snowy-christmas-trees','christmas-tree-skirt'];
 const treeSource=snapshot?.baselineReady===undefined&&treeKeys.every(key=>{const v=snapshot?.sources?.[key];return v?.complete===true&&Number.isInteger(v.expected)&&v.expected===v.unique&&Array.isArray(v.records)&&new Set(v.records.map(String)).size===v.unique;});
 if((snapshot?.baselineReady!==true&&!treeSource)||!Number.isFinite(Date.parse(snapshot.observedAt))||!Array.isArray(snapshot.products))return audit;
 const treeMembership=treeSource?new Set(treeKeys.flatMap(key=>snapshot.sources[key].records.map(String))):null;
 const counts=new Map();for(const p of snapshot.products)counts.set(String(p.sku),(counts.get(String(p.sku))||0)+1);
 for(const p of snapshot.products){
  const stale=(p.originalImages||[]).filter(g=>g.verification==='exact-official-SKU-directory-row-image-PDP-gallery-unavailable'&&(g.selectedSku!==String(p.sku)||g.variantId!==String(p.variantId)||g.sourceUrl!==p.sourceUrl||g.url!==p.variantImageUrl||p.listingVariantImageUrl&&p.listingVariantImageUrl!==g.url));
  if(stale.length){const urls=new Set(stale.map(g=>g.url));p.originalImages=p.originalImages.filter(g=>!stale.includes(g));delete p.directoryImageEvidence;if(urls.has(p.originalImageUrl))delete p.originalImageUrl;if(urls.has(p.originalImageEvidence?.sourceUrl)&&p.originalImageEvidence.method==='exact-official-SKU-directory-image-native-response-byte-mirror'){delete p.originalImageEvidence;delete p.originalCachedImageUrl;}}
  if(p.originalImages?.length)continue;
  const sku=String(p.sku||''),url=p.variantImageUrl;
  let page;try{page=new URL(p.sourceUrl);}catch{continue;}
  if(treeMembership&&!treeMembership.has(sku)||!/^\d{1,12}$/.test(sku)||counts.get(sku)!==1||p.variantId==null||!p.variantName||page.origin!=='https://www.therange.co.uk'||page.hash.slice(1)!==sku||!url||!validProductImage(url)||p.listingVariantImageUrl&&p.listingVariantImageUrl!==url){audit.rejected++;continue;}
  const proof={selectedSku:sku,variantId:String(p.variantId),sourceUrl:p.sourceUrl,sourceImageUrl:url,observedAt:snapshot.observedAt,method:'exact-official-SKU-directory-row-image-PDP-gallery-unavailable'};
  proof.sha256=createHash('sha256').update(JSON.stringify(proof)).digest('hex');
  p.directoryImageEvidence=proof;p.originalImages=[{url,selectedSku:sku,variantId:String(p.variantId),sourceUrl:p.sourceUrl,listingEvidence:proof,verification:proof.method}];audit.bound++;
 }
 return audit;
}
