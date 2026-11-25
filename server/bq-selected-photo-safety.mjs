import{knownForeignProductPhoto}from'../web/bq-foreign-photo-model.mjs';
import{bqFingerprint}from'./bq-products.mjs';
// This rejects an identified wrong selected photo. It never claims that every
// gallery frame is wrong or that a missing product photograph has been fixed.
export function annotateBqSelectedPhotoMismatch(p){
 if(!knownForeignProductPhoto(p))return false;
 p.sourceImageConflict||={kind:'known-unrelated-selected-photo',note:'所选官网图片为已核对的宠物笼，正确商品图仍待核验；不能用于带价图片或PDF · The selected official image shows a reviewed pet crate; the correct product photograph is still unverified and cannot be used for labelled images or PDF.',sourceFingerprint:bqFingerprint(p),imageHash:p.previewImage?.sha256||p.imageCacheEvidence?.sha256};
 p.sourcePhotoQuarantined=true;p.colorValues=[];p.treeColor='';
 if(p.paletteEvidence)p.paletteEvidence={...p.paletteEvidence,bodyColourVerified:false,sourcePhotoUnavailable:true};
 return true;
}
