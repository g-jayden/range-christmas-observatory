import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {detailFingerprint} from './collection-policy.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {materializeCommittedImage} from './committed-image-file.mjs';
import {compareSpringPhotoPair} from './spring-paired-photo-review.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const acceptable=c=>c?.equivalent===true&&c.rms<=4&&c.meanAbsolute<=2&&c.outlierRatio<=.01&&c.foregroundRms<=6&&c.maxBlockRms<=10&&Math.max(c.originalWidth||0,c.originalHeight||0)>=1000;
export function validSpringListingEquivalent(p,g,snapshot){
 const proof=g.listingEvidence?.nativeEquivalence,root=p.springListingImageRecovery,reference=snapshot.products?.find(r=>String(r.sku)===proof?.referenceSku);
 return Boolean(snapshot.source?.complete&&snapshot.source.expected===snapshot.products?.length&&proof&&acceptable(proof.comparison)&&p.detailsReady&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku)&&String(p.detailEvidence.exactVariantSource?.variantId)===String(p.variantId)&&proof.sku===String(p.sku)&&proof.variantId===String(p.variantId)&&g.url===proof.nativeImageUrl&&root?.ok&&root.sourceUrl===p.listingVariantImageUrl&&root.sha256===proof.rootImageHash&&proof.rootInputFingerprint===detailFingerprint(p)&&proof.sourceContentHash===p.detailEvidence?.sourceContentHash&&reference?.detailsReady&&reference.detailEvidence?.verifiedProductSection&&String(reference.detailEvidence.selectedSku)===String(reference.sku)&&reference.detailEvidence?.sourceContentHash===proof.referenceSourceContentHash&&String(reference.variantId)===proof.referenceVariantId&&snapshot.products.filter(r=>String(r.sku)===String(p.sku)).length===1&&snapshot.products.filter(r=>String(r.sku)===String(reference.sku)).length===1&&reference.originalImages?.some(image=>image.url===g.url&&!image.listingEvidence&&exactNativeGalleryMember(reference,image)));
}

// A matching photograph is not a matching offer. This links only the actual
// pixels of an exact SKU's observed root image to an already saved official
// large image. It never copies the reference SKU's size, price or other facts.
export async function applySpringListingEquivalences(snapshot,entries,{proofs,materialize=materializeCommittedImage,read=fs.readFile}={}){
 if(!proofs)try{proofs=JSON.parse(await fs.readFile('web/spring-repair/listing-image-equivalences.json','utf8')).proofs;}catch(error){if(error.code!=='ENOENT')throw error;proofs=[];}
 const by=new Map((snapshot.products||[]).map(p=>[String(p.sku),p])),applied=[],rejected=[];
 for(const proof of proofs||[]){const p=by.get(proof.sku),reference=by.get(proof.referenceSku),g={url:proof.nativeImageUrl,selectedSku:proof.sku,variantId:proof.variantId,listingEvidence:{method:'exact-SKU-root-photo-and-equivalent-saved-official-original',sourceUrl:snapshot.source?.url,nativeEquivalence:proof}};
  if(!p||!validSpringListingEquivalent(p,g,snapshot)){rejected.push({sku:proof.sku,reason:'source-or-root-photo-binding-changed'});continue;}
  const root=p.springListingImageRecovery,native=entries?.[proof.nativeImageUrl];
  if(native?.ok!==true||native.hash!==proof.nativeImageHash||native.cachedImageUrl!==proof.nativeCachePath||!/^images\/source\/[a-f0-9]{64}\.[a-z0-9]+$/.test(native.cachedImageUrl||'')||!root.cachedImageUrl){rejected.push({sku:proof.sku,reason:'native-response-record-not-verified'});continue;}
  try{await Promise.all([materialize(root.cachedImageUrl,root.sha256),materialize(native.cachedImageUrl,native.hash)]);const[small,large]=await Promise.all([read('web/'+root.cachedImageUrl),read('web/'+native.cachedImageUrl)]);if(digest(small)!==root.sha256||digest(large)!==native.hash)throw Error('Saved source-image digest changed');
   const comparison=await compareSpringPhotoPair(small,large);if(!acceptable(comparison))throw Error('Root image and large original are not pixel-equivalent');g.listingEvidence.nativeEquivalence={...proof,comparison,verifiedAt:new Date().toISOString()};
   p.originalImages=p.originalImages?.filter(image=>image.url!==g.url)||[];p.originalImages.push(g);applied.push({sku:p.sku,rootImageHash:root.sha256,nativeImageHash:native.hash,referenceSku:reference.sku});
  }catch(error){rejected.push({sku:proof.sku,reason:String(error.message).slice(0,160)});}
 }
 return{applied:applied.length,proofs:applied,rejected,sourceRequests:0,firecrawlCredits:0};
}
