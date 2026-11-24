import{rangeNativeTargets}from'./range-native-plan.mjs';
export function priorityNativeRequest(products,request,{now=Date.now()}={}){
 if(request?.version!==1||request.authorization!=='owner-all-collection-unrestricted-20261123'||!/^priority-native-[a-z0-9-]+$/.test(request.requestId||'')||!Number.isFinite(Date.parse(request.requestedAt))||Date.parse(request.requestedAt)>now+60000||now-Date.parse(request.requestedAt)>86400000||!Array.isArray(request.products)||!request.products.length)throw Error('Invalid or expired exact native repair request');
 const by=new Map(products.map(p=>[String(p.sku),p])),targets=new Map();
 for(const r of request.products){const p=by.get(String(r.sku));if(!p?.detailsReady||p.detailEvidence?.verifiedProductSection!==true||String(p.detailEvidence.selectedSku)!==String(r.sku)||String(p.variantId)!==String(r.variantId)||p.sourceUrl!==r.sourceUrl||!/^[a-f0-9]{64}$/.test(r.sourceContentHash||'')||p.detailEvidence.sourceContentHash!==r.sourceContentHash||!Array.isArray(r.imageUrls)||!r.imageUrls.length||new Set(r.imageUrls).size!==r.imageUrls.length)throw Error('Priority native source identity changed: '+r.sku);
  const exact=rangeNativeTargets([p],{includeGallery:true});for(const url of r.imageUrls){if(!exact.has(url))throw Error('Priority native URL is not an accepted exact-SKU gallery frame');targets.set(url,exact.get(url));}
 }return targets;
}
