import {hasVerifiedDetails} from './verified-evidence.mjs';
export function productEvidenceHealth(snapshots){
 const scopes=['catalogue','decorations','lights','themes'],unique=new Map(),coverage={};
 const photo=p=>Boolean(p.cachedImageUrl&&p.imageCacheEvidence?.sha256&&p.imageCacheEvidence.sourceUrl===(p.variantImageUrl||p.imageUrl));
 for(let i=0;i<snapshots.length;i++){const s=snapshots[i];if(!s)continue;coverage[scopes[i]]={total:s.products.length,verifiedDetails:s.products.filter(hasVerifiedDetails).length,verifiedPhotos:s.products.filter(photo).length,sourceObservedAt:s.observedAt};
  for(const p of s.products){if(p.taxonomyAudit?.disposition&&p.taxonomyAudit.disposition!=='include')continue;if(!unique.has(p.sku))unique.set(p.sku,{sku:p.sku,title:p.variantName,sourceUrl:p.sourceUrl,scopes:[],missingDetails:[],missingPhotos:[],issues:[]});const item=unique.get(p.sku);item.scopes.push(scopes[i]);if(!hasVerifiedDetails(p)){item.missingDetails.push(scopes[i]);if(p.detailIssue)item.issues.push(p.detailIssue);}if(!photo(p))item.missingPhotos.push(scopes[i]);}
 }
 const unresolved=[...unique.values()].filter(p=>p.missingDetails.length||p.missingPhotos.length);
 return {checkedAt:new Date().toISOString(),sourceRequestsMade:false,firecrawlCredits:0,coverage,includedUniqueSkus:unique.size,completeUniqueSkus:unique.size-unresolved.length,missingDetailsUniqueSkus:unresolved.filter(p=>p.missingDetails.length).length,missingPhotosUniqueSkus:unresolved.filter(p=>p.missingPhotos.length).length,unresolved};
}
