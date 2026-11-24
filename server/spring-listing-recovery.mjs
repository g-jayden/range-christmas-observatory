import {detailFingerprint} from './collection-policy.mjs';

export function validSpringListingRecovery(p,snapshot){
 const e=p.springListingImageRecovery;
 return Boolean(e?.ok&&e.selectedSku===String(p.sku)&&e.variantId===String(p.variantId)&&e.sourceUrl===p.listingVariantImageUrl&&e.sourceObservedAt===snapshot.observedAt&&e.inputFingerprint===detailFingerprint(p)&&/^[a-f0-9]{64}$/.test(e.sha256||'')&&e.cachedImageUrl&&e.width>=1000&&e.height>=1000);
}
export function springListingRecoveryCandidates(snapshot){
 if(!snapshot.source?.complete||snapshot.source.expected!==snapshot.products?.length)return[];
 const counts=new Map;for(const p of snapshot.products)counts.set(String(p.sku),(counts.get(String(p.sku))||0)+1);
 return snapshot.products.filter(p=>counts.get(String(p.sku))===1&&p.recordType==='sku'&&p.springAudit?.disposition==='review'&&p.detailsReady&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku)&&String(p.detailEvidence.exactVariantSource?.variantId)===String(p.variantId)&&p.detailInputFingerprint===detailFingerprint(p)&&p.observedAt===snapshot.observedAt&&p.listingVariantImageUrl&&!p.originalImages?.some(g=>g.url===p.listingVariantImageUrl||g.thumbnail===p.listingVariantImageUrl)&&!(p.springListingImageRecovery?.sourceUrl===p.listingVariantImageUrl&&p.springListingImageRecovery.sourceObservedAt===snapshot.observedAt&&p.springListingImageRecovery.inputFingerprint===detailFingerprint(p))).map(p=>({...p,variantImageUrl:p.listingVariantImageUrl}));
}
export function applySpringListingRecovery(snapshot,checked,audit){
 const by=new Map(checked.map(p=>[String(p.sku),p]));let examined=0,large=0;
 for(const p of snapshot.products){const c=by.get(String(p.sku)),e=c?.imageCacheEvidence;if(!c)continue;examined++;const failed=audit.failures?.find(f=>f.url===p.listingVariantImageUrl);
  p.springListingImageRecovery={ok:Boolean(e?.sourceUrl===p.listingVariantImageUrl&&e.sha256),selectedSku:String(p.sku),variantId:String(p.variantId),sourceUrl:p.listingVariantImageUrl,sourceObservedAt:snapshot.observedAt,inputFingerprint:detailFingerprint(p),checkedAt:audit.observedAt,...(e?.sourceUrl===p.listingVariantImageUrl?{sha256:e.sha256,width:e.width,height:e.height,bytes:e.bytes,mime:e.mime,cachedImageUrl:c.cachedImageUrl}:{error:failed?.error||'No verified response bytes',status:failed?.status||0})};
  if(!validSpringListingRecovery(p,snapshot))continue;
  const proof={method:'official-exact-SKU-listing-native-image',sourceUrl:snapshot.source.url,selectedSku:String(p.sku),variantId:String(p.variantId),observedAt:p.observedAt,resolutionVerified:true,sha256:e.sha256,width:e.width,height:e.height};
  if(!p.originalImages.some(g=>g.url===p.listingVariantImageUrl))p.originalImages.push({url:p.listingVariantImageUrl,selectedSku:String(p.sku),variantId:String(p.variantId),listingEvidence:proof});large++;
 }
 return{examined,large,smallOrUnavailable:examined-large,sourceRequestsMade:examined>0};
}
