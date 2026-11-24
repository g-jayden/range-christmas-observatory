import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {springHumanFrameAudit} from './spring-human-frame.mjs';
import {materializeCommittedImage} from './committed-image-file.mjs';
import {saveHumanWholeProductPreviews} from './product-previews.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';

export function springRejectedNativeFrames(products,reviews){
 const rejected={};for(const p of products){const r=reviews.products?.[p.sku],e=p.originalImageEvidence;
  if(r?.disposition!=='review'||!r.reviewArtifact||!r.reason||!p.detailsReady||!e?.sourceUrl||r.imageHash!==e.sha256||r.sourceContentHash!==p.detailEvidence?.sourceContentHash)continue;
  if(r.wholeProductFrame!==false&&!/close-up|closeup|logo|cropp|cuts? off|cut-off|marketing|diagram|obscur|not (?:the |a )?(?:whole|full|complete)|complete.*(?:frame|visible)|full.*frame/i.test(r.reason))continue;
  rejected[p.sku]={sourceUrl:e.sourceUrl,imageHash:e.sha256,sourceContentHash:r.sourceContentHash,reason:r.reason,reviewArtifact:r.reviewArtifact};
 }return rejected;
}

// Explicit frame choices are tied to the inspected SKU, description and native
// digest. Reuse an already saved original; a review never authorises a similar
// product's image, a guessed URL, or another source download.
export async function applyHumanSelectedSpringOriginals(products,reviews,entries){
 let applied=0;
 for(const p of products){const r=reviews.products?.[p.sku],url=r?.selectedNativeSourceUrl;
  if(r?.disposition!=='include'||r.wholeProductFrame!==true||!r.reviewArtifact||!r.reason||!url||!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku)||r.sourceContentHash!==p.detailEvidence.sourceContentHash)continue;
  if(!p.originalImages?.some(g=>g.url===url&&exactNativeGalleryMember(p,g)&&(g.variantId==null||String(g.variantId)===String(p.variantId))))continue;
  const e=entries?.[url];if(e?.ok!==true||e.hash!==r.imageHash||e.width<64||e.height<64||!/^images\/source\/[a-f0-9]{64}\.[a-z0-9]+$/.test(e.cachedImageUrl||''))continue;
  try{await materializeCommittedImage(e.cachedImageUrl,e.hash);const bytes=await fs.readFile('web/'+e.cachedImageUrl);if(createHash('sha256').update(bytes).digest('hex')!==e.hash)continue;
   p.originalImageUrl=url;p.originalCachedImageUrl=e.cachedImageUrl;p.originalImageEvidence={sourceUrl:url,sha256:e.hash,width:e.width,height:e.height,bytes:e.bytes,mime:e.mime,observedAt:e.observedAt};applied++;
  }catch{}
 }
 return{applied,sourceRequests:0,firecrawlCredits:0};
}

// A bound, human-inspected complete original does not need another paid
// gallery comparison or another vision-model pass to decide its framing.
export async function prepareSpringHumanPreviews(products,reviews){
 const prepared=new Set;let rendered=0,reused=0;
 for(const p of products){
  const review=reviews.products?.[p.sku],audit=springHumanFrameAudit({...p,previewImage:undefined},review);
  if(!audit||!p.originalCachedImageUrl)continue;
  const original=p.originalImageEvidence;
  try{
   await materializeCommittedImage(p.originalCachedImageUrl,original.sha256);
   const bytes=await fs.readFile('web/'+p.originalCachedImageUrl);
   if(createHash('sha256').update(bytes).digest('hex')!==original.sha256)continue;
   const saved=p.previewImage;
   if(saved?.method==='human-exact-SKU-whole-frame-preview'&&saved.sourceUrl===original.sourceUrl&&saved.originalSha256===original.sha256&&/^images\/previews\/[a-f0-9]{64}\.webp$/.test(saved.cachePath||'')){
    const old=await fs.readFile('web/'+saved.cachePath).catch(()=>null);
    if(old&&createHash('sha256').update(old).digest('hex')===saved.sha256){p.previewAudit=audit;prepared.add(p.sku);reused++;continue;}
   }
   const {data,info}=await sharp(bytes).rotate().resize({width:600,height:600,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toBuffer({resolveWithObject:true});
   const hash=createHash('sha256').update(data).digest('hex'),cachePath='images/previews/'+hash+'.webp';
   await fs.mkdir('web/images/previews',{recursive:true});await fs.writeFile('web/'+cachePath,data);
   p.previewImage={selectedSku:p.sku,sourceUrl:original.sourceUrl,sourceProductUrl:p.sourceUrl,cachePath,sha256:hash,width:info.width,height:info.height,originalWidth:original.width,originalHeight:original.height,originalSha256:original.sha256,method:'human-exact-SKU-whole-frame-preview',verifiedAt:review.reviewedAt};
   p.previewAudit=audit;delete p.humanPreviewIssue;prepared.add(p.sku);rendered++;
   if(prepared.size%250===0)console.log(JSON.stringify({phase:'spring-human-native-previews',prepared:prepared.size,rendered,reused,sourceRequests:0,firecrawlCredits:0}));
  }catch(error){p.humanPreviewIssue={error:String(error.message).slice(0,180)};}
 }
 await saveHumanWholeProductPreviews(products.filter(p=>prepared.has(p.sku)));
 return{prepared,rendered,reused,sourceRequests:0,firecrawlCredits:0};
}
