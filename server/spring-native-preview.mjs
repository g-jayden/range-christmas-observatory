import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {materializeCommittedImage} from './committed-image-file.mjs';
// A local-only review can select a better frame already collected earlier.
// Bind the classification/PDF original to those exact saved bytes as well;
// never classify one frame while showing a different frame to the customer.
export async function applySavedSpringPreviewOriginals(products,entries){
 let applied=0;const unresolved=[];
 for(const p of products){const url=p.previewImage?.sourceUrl;if(!url||!p.originalImages?.some(g=>g.url===url&&exactNativeGalleryMember(p,g)))continue;const e=entries?.[url];
  if(e?.ok!==true||!e.hash||e.width<64||e.height<64||!e.cachedImageUrl){unresolved.push({sku:p.sku,url,reason:'selected-native-bytes-unavailable'});continue;}
  try{await materializeCommittedImage(e.cachedImageUrl,e.hash);}catch{unresolved.push({sku:p.sku,url,reason:'selected-native-bytes-not-restorable'});continue;}
  p.originalImageUrl=url;p.originalCachedImageUrl=e.cachedImageUrl;p.originalImageEvidence={sourceUrl:url,sha256:e.hash,observedAt:e.observedAt,width:e.width,height:e.height,bytes:e.bytes,mime:e.mime};applied++;
 }
 return{applied,unresolved,sourceRequests:0,firecrawlCredits:0};
}
