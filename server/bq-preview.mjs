import{foreignBqPhotoEvidence}from'../web/bq-foreign-photo-model.mjs';
import{unavailableBqPreview,reusableUnavailableBqPreview}from'./bq-unavailable-preview.mjs';
import{bqUnchangedSourceVersion,bqVersionCheckedRecord}from'./bq-image-freshness.mjs';
import{preferExactBqColour}from'./bq-preview-colours.mjs';import{rankBqPreviewCandidates,bqSavedPreview}from'./bq-preview-ranking.mjs';import{bqFingerprint}from'./bq-products.mjs';import fs from'node:fs/promises';import{createHash}from'node:crypto';
import{bqAsset,bqImageKey,bqPreview,bqProperties,requestBqImage}from'./bq-images.mjs';import{analyseBqImages}from'./visual-model.mjs';import{bqPixelPalette}from'./bq-pixel-palette.mjs';import{previewGeometry,previewProblems,previewQualityScore}from'./preview-quality.mjs';import{bqPreviewOcr}from'./bq-preview-ocr.mjs';import{bqTextQuality,bqPreviewScore,bqNativeResolutionScore}from'./bq-ocr.mjs';import{bqBodyPalette}from'./bq-body-palette.mjs';
const VERSION='physical-product-full-source-gallery-local-image-and-OCR-review-v7';
export async function chooseBqPreview(p,{index,visual,selections,reviews={}}){
 const accepted=reviews[p.sku];if(accepted?.sourceFingerprint===bqFingerprint(p)&&accepted.department)p={...p,department:accepted.department};
 const images=[...new Set(p.originalImages.map(g=>bqAsset(g.url)))],prior=selections[p.sku],main=prior?.asset&&images.includes(prior.asset)?prior.asset:images[0];if(!main)return;
 if(reusableUnavailableBqPreview(p,images,prior,index,visual))return;
 const key=bqImageKey(main),v=visual[key],r=index[key],galleryFingerprint=createHash('sha256').update(JSON.stringify(images)).digest('hex');
 if(prior?.method===VERSION&&prior.sourceFingerprint===bqFingerprint(p)&&prior.physicalType===p.department&&prior.imageHash===r?.sha256&&prior.galleryFingerprint===galleryFingerprint&&!r.error&&v?.imageHash===r.sha256&&!foreignBqPhotoEvidence(p,r.sha256,v.ocr?.text))return;
 const foreignMain=foreignBqPhotoEvidence(p,r?.sha256,v?.ocr?.text),needs=foreignMain||!v||r?.error||previewProblems(v.quality).some(i=>['logo','diagram','detail','cropped','room'].includes(i))||bqBodyPalette(p,v).evidence.needsReview,candidates=[];
 async function load(asset){const k=bqImageKey(asset);let record=index[k],result=visual[k],file=record?.previewFile;
  let currentProps;
  if(record?.sha256&&!record.error&&result?.imageHash===record.sha256&&record.sourceVersion!=null&&Date.parse(record.checkedAt)<Date.parse(p.observedAt)){
   const response=await requestBqImage(asset+'?req=props,json');if(!response.ok)throw Error('Source metadata HTTP '+response.status);currentProps=bqProperties(await response.text());
   if(bqUnchangedSourceVersion(record,currentProps)){record=bqVersionCheckedRecord(record,currentProps);index[k]=record;}
  }
  if(!record||record.error||result?.imageHash!==record.sha256||Date.parse(record.checkedAt)<Date.parse(p.observedAt)){
   const[props,response]=await Promise.all([currentProps||requestBqImage(asset+'?req=props,json').then(async r=>{if(!r.ok)throw Error('Source metadata HTTP '+r.status);return bqProperties(await r.text());}),requestBqImage(bqPreview(asset))]);if(!response.ok)throw Error('Source preview HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());file='runtime/bq-previews/'+k+'.jpg';await fs.writeFile(file,bytes);record={asset,...props,previewFile:file,sha256:createHash('sha256').update(bytes).digest('hex'),checkedAt:new Date().toISOString(),etag:response.headers.get('etag'),nativeBytesVerified:false};index[k]=record;
  }
  if(!result||result.imageHash!==record.sha256){result=(await analyseBqImages([p],[file]))[0];result.quality.geometry=await previewGeometry(file);result.pixelPalette=await bqPixelPalette(file);result={...result,imageHash:record.sha256,asset};}
  if(!result.ocr){if(!file||!await fs.stat(file).catch(()=>null)){const response=await requestBqImage(bqPreview(asset));if(!response.ok)throw Error('OCR source preview HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Image changed during local preview review');file='runtime/bq-previews/'+k+'.jpg';await fs.writeFile(file,bytes);record.previewFile=file;}result.ocr=await bqPreviewOcr(file);}
  result.textQuality=bqTextQuality(p,result,result.ocr);visual[k]=result;candidates.push({asset,r:record,v:result,score:bqPreviewScore(p,result,result.ocr,previewQualityScore(result.quality))+bqNativeResolutionScore(record)});
 }
 try{await load(main);}catch(e){index[key]={...r,asset:main,error:e.message,failedAt:new Date().toISOString()};}
 if(needs)for(const asset of images.filter(a=>a!==main).slice(0,foreignMain?12:needs&&previewProblems(v?.quality||{}).some(i=>['logo','diagram','detail','cropped'].includes(i))?12:4)){try{await load(asset);}catch(e){const k=bqImageKey(asset);index[k]={...index[k],asset,error:e.message,failedAt:new Date().toISOString()};}}
 const trustworthy=candidates.filter(c=>!foreignBqPhotoEvidence(p,c.r.sha256,c.v.ocr?.text));if(!trustworthy.length){const unavailable=unavailableBqPreview(p,images,index,visual);if(unavailable)selections[p.sku]=unavailable;return;}const ranked=rankBqPreviewCandidates(p,trustworthy),best=ranked[0],original=ranked.find(c=>c.asset===images[0]),selected=bqSavedPreview(p,accepted,trustworthy)||preferExactBqColour(p,(original&&original.score>=best.score-.2?original:best),trustworthy);
 selections[p.sku]={sku:p.sku,sourceFingerprint:bqFingerprint(p),physicalType:p.department,asset:selected.asset,galleryFingerprint,imageHash:selected.r.sha256,issues:previewProblems(selected.v.quality),textQuality:selected.v.textQuality,method:VERSION};
}
