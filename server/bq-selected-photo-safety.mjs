import{knownForeignProductPhoto,foreignBqPhotoEvidence}from'../web/bq-foreign-photo-model.mjs';
import{bqFingerprint}from'./bq-products.mjs';
import{bqAsset,bqImageKey,bqOriginal}from'./bq-images.mjs';
export function annotateBqKnownWrongGallery(p,index,review){
 if(p.retailerId!=='bq')return;
 const fingerprint=bqFingerprint(p),gallery=new Set((p.originalImages||[]).map(g=>bqAsset(g.url))),rows=review?.sourceFingerprint===fingerprint?(p.galleryRejections||[]).filter(g=>gallery.has(bqAsset(g.sourceUrl||g.url))&&index[bqImageKey(g.sourceUrl||g.url)]?.sha256===g.imageHash):[];
 const rejected=new Set(rows.map(g=>bqAsset(g.sourceUrl||g.url)));
 for(const g of p.originalImages||[]){const asset=bqAsset(g.url),record=index[bqImageKey(asset)];if(record?.error||!foreignBqPhotoEvidence(p,record?.sha256)||rejected.has(asset))continue;rows.push({url:g.url,sourceUrl:bqOriginal(asset),imageHash:record.sha256,sourceFingerprint:fingerprint,checkedAt:record.checkedAt,reason:'官网该图库图经图片指纹确认是无关宠物笼，未作为商品详情图展示 · This exact official gallery image is a reviewed unrelated pet crate and is excluded from the product gallery'});rejected.add(asset);}
 if(rows.length)p.galleryRejections=rows;else delete p.galleryRejections;
}
// This rejects an identified wrong selected photo. It never claims that every
// gallery frame is wrong or that a missing product photograph has been fixed.
export function annotateBqSelectedPhotoMismatch(p){
 if(!knownForeignProductPhoto(p))return false;
 p.sourceImageConflict||={kind:'known-unrelated-selected-photo',note:'所选官网图片为已核对的宠物笼，正确商品图仍待核验；不能用于带价图片或PDF · The selected official image shows a reviewed pet crate; the correct product photograph is still unverified and cannot be used for labelled images or PDF.',sourceFingerprint:bqFingerprint(p),imageHash:p.previewImage?.sha256||p.imageCacheEvidence?.sha256};
 p.sourcePhotoQuarantined=true;p.colorValues=[];p.treeColor='';
 if(p.paletteEvidence)p.paletteEvidence={...p.paletteEvidence,bodyColourVerified:false,sourcePhotoUnavailable:true};
 return true;
}
