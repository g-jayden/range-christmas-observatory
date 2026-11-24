import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {springReviewFingerprint} from './spring-review-fingerprint.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {materializeCommittedImage} from './committed-image-file.mjs';
import {compareSpringPhotoPair} from './spring-paired-photo-review.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function applyIdenticalSpringNativePhotos(catalogue,source,proofs,{sourceRoot='web',readNative=async(file,expected)=>{await materializeCommittedImage(file,expected,{root:sourceRoot});return fs.readFile(path.join(sourceRoot,file));}}={}){
 const records=new Map((source?.products||[]).map(p=>[String(p.sku),p])),products=[...catalogue.products],audit={applied:[],skipped:[],sourceRequests:0,firecrawlCredits:0,originalBytesChanged:false};
 if(source?.source?.complete!==true||source.observedAt!==catalogue.observedAt)return {catalogue,audit:{...audit,skipped:[{reason:'complete-current-source-observation-required'}]}};
 for(const proof of proofs?.products||[]){
  const i=products.findIndex(p=>String(p.sku)===String(proof.sku)),p=products[i],donor=records.get(String(proof.nativeSourceSku));
  const bound=(row,fingerprint)=>row?.retailerId==='the-range'&&row.collectionId==='spring'&&row.detailsReady&&row.detailEvidence?.verifiedProductSection&&String(row.detailEvidence.selectedSku)===String(row.sku)&&row.springAudit?.disposition==='include'&&springReviewFingerprint(row)===fingerprint;
  const frame=donor?.originalImages?.find(g=>g.url===proof.nativeUrl&&exactNativeGalleryMember(donor,g));
  if(i<0||!bound(p,proof.sourceFactsFingerprint)||!bound(donor,proof.nativeSourceFactsFingerprint)||!p.springAudit.wholeProductFrame||!p.springAudit.reviewArtifact||String(p.variantId)!==String(proof.variantId)||p.originalImageEvidence?.sourceUrl!==proof.rootUrl||p.originalImageEvidence.sha256!==proof.rootHash||p.springAudit.imageHash!==proof.rootHash||!frame||donor.originalImageEvidence?.sourceUrl!==proof.nativeUrl||donor.originalImageEvidence.sha256!==proof.nativeHash||!proof.reviewArtifact||!Number.isFinite(Date.parse(proof.reviewedAt))){audit.skipped.push({sku:proof.sku,reason:'source-or-native-photo-binding-changed'});continue;}
  try{
   const [small,large]=await Promise.all([readNative(p.originalCachedImageUrl,proof.rootHash),readNative(donor.originalCachedImageUrl,proof.nativeHash)]);
   if(hash(small)!==proof.rootHash||hash(large)!==proof.nativeHash)throw Error('native digest mismatch');
   const comparison=await compareSpringPhotoPair(small,large);if(!comparison.equivalent||comparison.thumbnailWidth!==p.originalImageEvidence.width||comparison.thumbnailHeight!==p.originalImageEvidence.height||comparison.originalWidth!==donor.originalImageEvidence.width||comparison.originalHeight!==donor.originalImageEvidence.height)throw Error('not the identical larger photograph');
   const evidence={...proof,method:'same-retailer-identical-photo-decoded-pixel-equivalence-v1',comparison,nativeSourceUrl:donor.sourceUrl};
   const original={...donor.originalImageEvidence,sourceUrl:proof.nativeUrl,selectedSku:p.sku,nativeSourceSku:donor.sku},gallery={url:proof.nativeUrl,selectedSku:p.sku,variantId:p.variantId,thumbnail:p.originalCachedImageUrl,nativeCachePath:donor.originalCachedImageUrl,nativeSha256:proof.nativeHash,width:original.width,height:original.height,listingEvidence:evidence};
   products[i]={...p,sourceThumbnailImageEvidence:p.originalImageEvidence,identicalPhotoOriginalEvidence:evidence,originalImageUrl:proof.nativeUrl,originalCachedImageUrl:donor.originalCachedImageUrl,originalImageEvidence:original,originalImages:[...p.originalImages,gallery],springAudit:{...p.springAudit,imageHash:proof.nativeHash,nativeEquivalence:evidence},...(p.previewImage?{previewImage:{...p.previewImage,sourceUrl:proof.nativeUrl,originalWidth:original.width,originalHeight:original.height,originalSha256:proof.nativeHash}}:{})};
   audit.applied.push({sku:p.sku,rootWidth:comparison.thumbnailWidth,nativeWidth:comparison.originalWidth,nativeHash:proof.nativeHash});
  }catch(e){audit.skipped.push({sku:proof.sku,reason:e.message});}
 }
 return {catalogue:{...catalogue,products,revision:hash(JSON.stringify(products)),originalPhotoUpgradeAudit:audit},audit};
}
