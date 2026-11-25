import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {SPRING_VERSION,isSpringScope} from '../web/spring-model.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {bindSpringSavedGalleryNatives} from './spring-native-preview.mjs';
import {execFileSync} from 'node:child_process';

// Collection coverage, individual product acceptance and completion of the
// remaining review queue are separate facts. A pending SKU cannot prevent
// already accepted products from being browsed or weaken their evidence gate.
export function verifiedSpringBrowse(catalogue,review,status){
 const fail=message=>{throw Error('Spring browse publication: '+message);};
 if(catalogue?.version!==SPRING_VERSION||catalogue.retailerId!=='the-range'||catalogue.collectionId!=='spring'||catalogue.collectionComplete!==true||catalogue.source?.complete!==true||!Number.isFinite(Date.parse(catalogue.observedAt)))fail('complete official source observation required');
 if(!Array.isArray(catalogue.products)||!catalogue.products.length||!Array.isArray(review?.pending)||!Array.isArray(review?.excluded))fail('accepted products and complete review accounting required');
 const count=catalogue.source.expected;
 if(!Number.isInteger(count)||catalogue.source.observed!==count||catalogue.source.unique!==count||review.totalSourceSkus!==count||status.totalSourceSkus!==count||review.included+review.excluded.length+review.pending.length!==count)fail('source and review totals disagree');
 if([review,status].some(d=>d.observedAt!==catalogue.observedAt)||status.revision!==catalogue.revision||status.products!==catalogue.products.length||review.displayedUnique!==catalogue.products.length||status.reviewPending!==review.pending.length)fail('mixed observation or review versions');
 if(createHash('sha256').update(JSON.stringify(catalogue.products)).digest('hex')!==catalogue.revision)fail('accepted product revision mismatch');
 const held=new Set([...review.pending,...review.excluded].map(p=>String(p.sku))),seen=new Set(),counts={};
 for(const p of catalogue.products){
  const sku=String(p.sku),photo=p.originalImageEvidence,detail=p.detailEvidence,audit=p.springAudit;
  if(seen.has(sku)||held.has(sku))fail('duplicate or held SKU '+sku);seen.add(sku);
  if(p.retailerId!=='the-range'||p.collectionId!=='spring'||p.recordType!=='sku'||p.inStock!==true||!Number.isFinite(p.priceGBP)||p.priceGBP<0||!isSpringScope(p.department)||p.departmentIds?.length!==1||p.departmentIds[0]!==p.department)fail('invalid offered product '+sku);
  if(p.detailsReady!==true||detail?.verifiedProductSection!==true||String(detail.selectedSku)!==sku||audit?.version!==SPRING_VERSION||audit.disposition!=='include'||audit.sourceContentHash!==detail.sourceContentHash||!detail.sourceContentHash)fail('unaccepted exact-SKU detail '+sku);
  if(p.springNativePhotoVerified!==true||!/^[a-f0-9]{64}$/.test(photo?.sha256||'')||audit.imageHash!==photo.sha256||!p.originalCachedImageUrl||!p.originalImages?.some(g=>g.url===photo.sourceUrl&&exactNativeGalleryMember(p,g)))fail('unaccepted native photo '+sku);
  if(!['kept','selected'].includes(p.previewAudit?.status)||(p.previewAudit.issues||[]).some(i=>['logo','diagram','detail','cropped'].includes(i))||p.previewImage&&(p.previewImage.sourceUrl!==photo.sourceUrl||p.previewImage.originalSha256!==photo.sha256)||p.springDimensionAudit?.status==='unresolved')fail('unaccepted full frame or dimensions '+sku);
  counts[p.department]=(counts[p.department]||0)+1;
 }
 for(const [id,n]of Object.entries(review.counts||{}))if((counts[id]||0)!==n)fail('category totals disagree: '+id);
 const reviewPending=review.pending.length,reviewComplete=reviewPending===0;
 return {...catalogue,browseReady:true,reviewComplete,reviewPending,ready:reviewComplete,automaticArrivalChecks:catalogue.baselineReady===true&&catalogue.automaticArrivalChecks===true};
}

export async function publishVerifiedSpringBrowse(sourceRoot='web',targetRoot='public'){
 const read=name=>fs.readFile(path.join(sourceRoot,'spring',name),'utf8').then(JSON.parse);
 const inputs=await Promise.allSettled(['candidate-catalogue.json','review.json','status.json'].map(read));
 if(inputs.every(r=>r.status==='rejected'&&r.reason.code==='ENOENT'))return {browseReady:false,products:0,sourceRequests:0,firecrawlCredits:0};
 for(const r of inputs)if(r.status==='rejected')throw r.reason;
 const [candidate,review,status]=inputs.map(r=>r.value);
 let catalogue=verifiedSpringBrowse(candidate,review,status);const output=path.join(targetRoot,'spring');
 const proofs=await fs.readFile(path.join(sourceRoot,'spring','identical-photo-originals.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(proofs?.products?.length){const {applyIdenticalSpringNativePhotos}=await import('./spring-identical-native.mjs'),source=JSON.parse(await fs.readFile(path.join(sourceRoot,'spring','source.json'),'utf8')),result=await applyIdenticalSpringNativePhotos(catalogue,source,proofs,{sourceRoot});catalogue=result.catalogue;}
 const savedGallery=await fs.readFile(path.join(sourceRoot,'spring','image-checkpoint.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return{entries:{}};throw e;});
 // A historical metadata row cannot publish a broken archive link. Sparse
 // checkouts may omit a real tracked file; the committed tree still proves it.
 let tracked=new Set();try{tracked=new Set(execFileSync('git',['ls-files','-z','--',path.join(sourceRoot,'images/source')],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:67108864}).split('\0'));}catch{}
 const available=new Map(),exists=async relative=>{if(!/^images\/source\/[a-f0-9]{64}\.(?:jpe?g|png|webp|avif|gif)$/.test(relative||''))return false;if(!available.has(relative)){const file=path.join(sourceRoot,relative);let yes=tracked.has(file);if(!yes)try{yes=(await fs.stat(file)).isFile();}catch(e){if(e.code!=='ENOENT')throw e;}available.set(relative,yes);}return available.get(relative);};
 const durable={};for(const[url,e]of Object.entries(savedGallery.entries||{}))if(e.ok===true&&await exists(e.cachedImageUrl))durable[url]=e;
 let removedUnavailable=0;for(const p of catalogue.products)for(const g of p.originalImages||[])if(g.nativeCachePath?.startsWith('images/source/')&&!await exists(g.nativeCachePath)){for(const k of['nativeCachePath','nativeSha256','sourceWidth','sourceHeight'])delete g[k];removedUnavailable++;}
 const galleryAudit={...bindSpringSavedGalleryNatives(catalogue.products,durable),removedUnavailable};
 if(galleryAudit.applied||removedUnavailable)catalogue={...catalogue,revision:createHash('sha256').update(JSON.stringify(catalogue.products)).digest('hex'),savedGalleryNativeAudit:galleryAudit};
 await fs.mkdir(output,{recursive:true});
 await fs.writeFile(path.join(output,'catalogue.json'),JSON.stringify(catalogue));
 await fs.writeFile(path.join(output,'status.json'),JSON.stringify({...status,revision:catalogue.revision,browseReady:true,reviewComplete:catalogue.reviewComplete,ready:catalogue.ready,...(catalogue.originalPhotoUpgradeAudit?{originalPhotoUpgradeAudit:catalogue.originalPhotoUpgradeAudit}:{}),...(catalogue.savedGalleryNativeAudit?{savedGalleryNativeAudit:catalogue.savedGalleryNativeAudit}:{})}));
 await fs.writeFile(path.join(output,'review.json'),JSON.stringify(review));
 return {browseReady:true,products:catalogue.products.length,counts:review.counts,reviewPending:catalogue.reviewPending,reviewComplete:catalogue.reviewComplete,originalPhotoUpgradeAudit:catalogue.originalPhotoUpgradeAudit,sourceRequests:0,firecrawlCredits:0,sourceFactsChanged:false};
}
