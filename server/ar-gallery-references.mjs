// Preserve every supplier gallery record. A reviewed alternate colour or
// different-size diagram is labelled as a family reference, not SKU evidence.
export function applyArGalleryReferences(p,record,index){
 delete p.sourceFamilyReferenceImages;
 if(!record||record.selectedSku!==p.sku||record.selectedPreviewSha256!==p.previewImage?.sha256)return 0;
 const refs=[];for(const r of record.images||[]){const g=p.originalImages?.find(g=>g.url===r.url&&g.selectedSku===p.sku);if(!g||r.url===p.previewImage.sourceUrl||!r.reason||index[r.url]?.hash!==r.previewSha256)continue;refs.push({url:r.url,reason:r.reason,selectedSku:p.sku,previewSha256:r.previewSha256,method:'exact-native-gallery-visual-family-reference-review'});}
 p.sourceFamilyReferenceImages=refs;return refs.length;
}
