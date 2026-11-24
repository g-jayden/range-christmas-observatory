import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {springHumanFrameAudit} from './spring-human-frame.mjs';
import {materializeCommittedImage} from './committed-image-file.mjs';
import {saveHumanWholeProductPreviews} from './product-previews.mjs';

// A bound, human-inspected complete original does not need another paid
// gallery comparison or another vision-model pass to decide its framing.
export async function prepareSpringHumanPreviews(products,reviews){
 const prepared=new Set;
 for(const p of products){
  const review=reviews.products?.[p.sku],audit=springHumanFrameAudit({...p,previewImage:undefined},review);
  if(!audit||!p.originalCachedImageUrl)continue;
  const original=p.originalImageEvidence;
  try{
   await materializeCommittedImage(p.originalCachedImageUrl,original.sha256);
   const bytes=await fs.readFile('web/'+p.originalCachedImageUrl);
   if(createHash('sha256').update(bytes).digest('hex')!==original.sha256)continue;
   const {data,info}=await sharp(bytes).rotate().resize({width:600,height:600,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toBuffer({resolveWithObject:true});
   const hash=createHash('sha256').update(data).digest('hex'),cachePath='images/previews/'+hash+'.webp';
   await fs.mkdir('web/images/previews',{recursive:true});await fs.writeFile('web/'+cachePath,data);
   p.previewImage={selectedSku:p.sku,sourceUrl:original.sourceUrl,sourceProductUrl:p.sourceUrl,cachePath,sha256:hash,width:info.width,height:info.height,originalWidth:original.width,originalHeight:original.height,originalSha256:original.sha256,method:'human-exact-SKU-whole-frame-preview',verifiedAt:review.reviewedAt};
   p.previewAudit=audit;prepared.add(p.sku);
  }catch(error){p.humanPreviewIssue={error:String(error.message).slice(0,180)};}
 }
 await saveHumanWholeProductPreviews(products.filter(p=>prepared.has(p.sku)));
 return{prepared,sourceRequests:0,firecrawlCredits:0};
}
