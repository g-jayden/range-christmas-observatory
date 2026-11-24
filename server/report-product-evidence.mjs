import{sameEvidenceIdentity}from'./verified-evidence.mjs';
// Range's compact in-stock catalogue predates the other retailers' explicit
// inStock boolean. Its complete filtered directory and exact record membership
// are the stock evidence; a missing boolean is not an out-of-stock response.
import {titleSizeFacts,nativeSourceUrl} from '../web/product-facts.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
export function reportProductEvidence(product,candidate,source,{retailerId,now=Date.now()}={}){
 const sku=String(product.sku),reasons=[];
 if(product.sourceUrl!==candidate.sourceUrl)reasons.push('source-URL-changed');
 const rangeStock=retailerId==='the-range'&&source?.sourceAudits?.some(a=>a.complete===true&&a.records?.some(s=>String(s)===sku)&&a.batches?.some(b=>{try{const u=new URL(b.url),filters=JSON.parse(u.searchParams.get('filters')||'{}');return filters.in_stock_f?.includes('true');}catch{return false;}}));
 if(product.inStock!==true&&!(product.inStock!==false&&rangeStock))reasons.push('current-in-stock-source-proof-missing');
 const fullDetail=product.detailsReady&&product.detailEvidence?.verifiedProductSection&&String(product.detailEvidence.selectedSku)===sku;
 // A PDF contains only current name, price, size and a verified exact-SKU
 // original. An unavailable, unused long-description section must not block
 // these independently established fields or promote a PDP to verified.
 const explicitSize=titleSizeFacts(product),native=nativeSourceUrl(product),photo=product.originalImages?.some(g=>g.url===native&&exactNativeGalleryMember(product,g)),epoch=Date.parse(product.observedAt),day=new Date(now+28800000).toISOString().slice(0,10),cutoff=Date.parse(day+'T06:00:00+08:00');
 const currentClosedDirectory=source?.collectionComplete===true&&source?.baselineReady===true&&source.observedAt===product.observedAt&&source.products?.some(p=>String(p.sku)===sku&&p.sourceUrl===product.sourceUrl&&p.variantName===product.variantName&&p.priceGBP===product.priceGBP&&p.inStock===true);
 const directoryReport=!fullDetail&&currentClosedDirectory&&epoch>=cutoff&&epoch<=now&&explicitSize&&photo&&!product.imageIssue&&!product.previewReviewRequired&&!product.previewImage?.issues?.length;
 if(!fullDetail&&!directoryReport)reasons.push('exact-SKU-detail-proof-missing');
 if(!Number.isFinite(product.priceGBP)||product.priceGBP<0)reasons.push('current-price-missing');
 if(product.sourceImageConflict)reasons.push('official-title-photo-conflict');
 if(product.classificationEvidence?.requiresReview||product.taxonomyAudit?.disposition==='exclude')reasons.push('physical-classification-unaccepted');
 return {accepted:!reasons.length,reasons,...(directoryReport?{contract:'current-directory-explicit-title-size-and-exact-SKU-native-gallery',reportSize:explicitSize,descriptionVerified:false}:{})};
}

export function reportFieldProduct(product,acceptance){if(acceptance.contract!=='current-directory-explicit-title-size-and-exact-SKU-native-gallery')return product;return{...product,specifications:{},dimensions:acceptance.reportSize,sourceDescription:'',productSummary:'',heightLabel:null,heightCm:null,skirtDiameterCm:null,skirtBaseDiameterCm:null,skirtTopDiameterCm:null,reportFieldEvidence:{contract:acceptance.contract,sourceName:product.variantName,sourceObservedAt:product.observedAt,sizeSource:'exact-SKU official listing title',descriptionVerified:false}};}

export function mergeReportProduct(current,full={}){
 // A reused detail shard cannot replace facts from a changed selected offer.
 // A matching SKU alone does not prove that a renamed/relocated variant is unchanged.
 const range=/^https:\/\/www\.therange\.co\.uk\//.test(current.sourceUrl||'');
 if(full.sku!==undefined&&String(full.sku)!==String(current.sku)||full.retailerId&&current.retailerId&&full.retailerId!==current.retailerId||full.sourceUrl&&current.sourceUrl&&full.sourceUrl!==current.sourceUrl||range&&full.sku!==undefined&&!sameEvidenceIdentity(current,full))return{...current};
 const merged={...current,...full};
 for(const k of ['sku','variantId','variantName','name','baseName','retailerId','collectionId','priceGBP','price','originalPrice','originalPriceKind','sourcePriceBadge','inStock','newStatus','observedAt','sourceUrl','department','departmentIds','kind','taxonomyAudit','classificationEvidence','previewImage','sourceImageConflict','detailsReady'])if(current[k]!==undefined)merged[k]=current[k];
 return merged;
}
