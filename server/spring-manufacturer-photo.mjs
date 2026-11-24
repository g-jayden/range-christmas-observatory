import fs from'node:fs/promises';
import{createHash}from'node:crypto';
import{detailFingerprint}from'./collection-policy.mjs';
import{springReviewFingerprint}from'./spring-review-fingerprint.mjs';
import{materializeCommittedImage}from'./committed-image-file.mjs';
import{compareSpringPhotoPair}from'./spring-paired-photo-review.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
export const MANUFACTURER_PHOTO_METHOD='exact-listed-photo-and-primary-manufacturer-native';
export function manufacturerPhotoSourceHash(p){return digest(JSON.stringify([String(p.id),p.handle,p.title,p.updated_at,(p.images||[]).map(i=>[String(i.id),i.src,i.width,i.height]),(p.variants||[]).map(v=>[String(v.id),v.sku])]));}
const nativeUrl=raw=>{try{const u=new URL(raw);return u.origin==='https://cdn.shopify.com'&&!u.username&&!u.password&&!u.port&&/^\/s\/files\/1\/1032\/7795\/3356\/(?:files|products)\/.+\.(?:jpe?g|png|webp|avif|gif)$/i.test(u.pathname)&&[...u.searchParams.keys()].every(k=>k==='v');}catch{return false;}};
const exactComparison=c=>c?.equivalent===true&&c.rms<=4&&c.meanAbsolute<=2&&c.outlierRatio<=.01&&c.foregroundRms<=6&&c.maxBlockRms<=10&&Math.max(c.originalWidth||0,c.originalHeight||0)>=1000;
export function validSpringManufacturerPhoto(p,g,snapshot){
 const proof=g.listingEvidence?.nativeEquivalence,ref=proof?.reference,product=ref?.product;
 if(g.listingEvidence?.method!==MANUFACTURER_PHOTO_METHOD||!snapshot.source?.complete||snapshot.source.expected!==snapshot.products?.length||!proof||!ref||!product||!exactComparison(proof.comparison))return false;
 const sourcePath='https://www.leafplants.co.uk/products/'+product.handle;
 return Boolean(p.retailerId==='the-range'&&p.collectionId==='spring'&&p.recordType==='sku'&&p.detailsReady&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku)&&String(p.detailEvidence.exactVariantSource?.variantId)===String(p.variantId)&&proof.sku===String(p.sku)&&proof.variantId===String(p.variantId)&&String(g.selectedSku)===String(p.sku)&&String(g.variantId)===String(p.variantId)&&snapshot.products.filter(r=>String(r.sku)===String(p.sku)).length===1&&proof.rootImageUrl===p.listingVariantImageUrl&&proof.rootInputFingerprint===detailFingerprint(p)&&(proof.sourceFactsFingerprint?proof.sourceFactsFingerprint===springReviewFingerprint(p):proof.sourceContentHash===p.detailEvidence.sourceContentHash)&&/^[a-f0-9]{64}$/.test(proof.rootImageHash||'')&&/^[a-f0-9]{64}$/.test(proof.nativeImageHash||'')&&proof.nativeImageUrl===g.url&&g.thumbnail===proof.rootImageUrl&&nativeUrl(g.url)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle||'')&&ref.sourceUrl===sourcePath&&ref.sourceHash===manufacturerPhotoSourceHash(product)&&product.images?.some(i=>i.src===g.url&&i.width===proof.comparison.originalWidth&&i.height===proof.comparison.originalHeight));
}

// The root SKU supplies the photograph identity. A manufacturer's image is
// eligible only when its actual pixels reproduce that exact listed photograph.
// Product models, prices, sizes, materials and descriptions are never copied.
export async function applySpringManufacturerPhotos(snapshot,entries,{proofs,materialize=materializeCommittedImage,read=fs.readFile}={}){
 if(!proofs)try{proofs=JSON.parse(await fs.readFile('web/spring-repair/manufacturer-photo-equivalences.json','utf8')).proofs;}catch(error){if(error.code!=='ENOENT')throw error;proofs=[];}
 const by=new Map((snapshot.products||[]).map(p=>[String(p.sku),p])),applied=[],rejected=[],nativeEntries={};
 for(const proof of proofs||[]){const p=by.get(proof.sku),g={url:proof.nativeImageUrl,thumbnail:proof.rootImageUrl,selectedSku:proof.sku,variantId:proof.variantId,listingEvidence:{method:MANUFACTURER_PHOTO_METHOD,sourceUrl:snapshot.source?.url,nativeEquivalence:proof}};
  if(!p||!validSpringManufacturerPhoto(p,g,snapshot)){rejected.push({sku:proof.sku,reason:'exact-root-SKU-or-manufacturer-photo-source-changed'});continue;}
  const root=entries?.[proof.rootImageUrl];
  if(!root?.ok||root.hash!==proof.rootImageHash||!new RegExp('^images/source/'+proof.rootImageHash+'\\.(?:jpg|png|webp|avif|gif)$').test(root.cachedImageUrl||'')||!new RegExp('^images/source/'+proof.nativeImageHash+'\\.(?:jpg|png|webp|avif|gif)$').test(proof.nativeCachePath||'')){rejected.push({sku:proof.sku,reason:'saved-original-or-root-response-not-bound'});continue;}
  try{
   await Promise.all([materialize(root.cachedImageUrl,root.hash),materialize(proof.nativeCachePath,proof.nativeImageHash)]);
   const[small,large]=await Promise.all([read('web/'+root.cachedImageUrl),read('web/'+proof.nativeCachePath)]);
   if(digest(small)!==root.hash||digest(large)!==proof.nativeImageHash)throw Error('Saved photograph bytes changed');
   const comparison=await compareSpringPhotoPair(small,large);if(!exactComparison(comparison)||comparison.originalWidth!==proof.comparison.originalWidth||comparison.originalHeight!==proof.comparison.originalHeight)throw Error('Manufacturer original does not reproduce the exact listed photograph');
   const entry={url:g.url,ok:true,hash:proof.nativeImageHash,cachedImageUrl:proof.nativeCachePath,width:comparison.originalWidth,height:comparison.originalHeight,bytes:large.length,mime:proof.mime,observedAt:proof.nativeObservedAt,sourceBytesUnchanged:true,method:MANUFACTURER_PHOTO_METHOD};
   nativeEntries[g.url]=entry;p.originalImages=(p.originalImages||[]).filter(i=>i.url!==g.url);p.originalImages.push(g);
   p.manufacturerPhotoEvidence={method:MANUFACTURER_PHOTO_METHOD,sourceProductUrl:proof.reference.sourceUrl,rootImageUrl:proof.rootImageUrl,rootImageHash:root.hash,nativeImageUrl:g.url,nativeImageHash:proof.nativeImageHash,sourceContentHash:proof.sourceContentHash,comparison,verifiedAt:new Date().toISOString(),retailerProductFactsCopied:false};
   applied.push({sku:p.sku,originalWidth:comparison.originalWidth,originalHeight:comparison.originalHeight,rootImageHash:root.hash,nativeImageHash:proof.nativeImageHash});
  }catch(error){rejected.push({sku:proof.sku,reason:String(error.message).slice(0,160)});}
 }
 return{applied:applied.length,proofs:applied,rejected,nativeEntries,sourceRequests:0,firecrawlCredits:0};
}
