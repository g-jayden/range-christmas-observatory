import {bqAsset} from './bq-images.mjs';import {bqFingerprint} from './bq-products.mjs';
export function applyBqNativeExport(product,review,sourceImage){
 const e=review?.nativeExport;if(!e||review.sourceFingerprint!==bqFingerprint(product)||e.sourceVersion!==sourceImage?.sourceVersion||e.width!==sourceImage.width||e.height!==sourceImage.height||e.asset!==bqAsset(product.originalImageUrl)||!product.originalImages.some(g=>bqAsset(g.url)===e.asset&&String(g.selectedSku)===String(product.sku))||!/^[a-f0-9]{64}$/.test(e.sha256||'')||e.cachePath!=='images/source/'+e.sha256+'.jpg')return false;
 const u=new URL(e.exportUrl);if(bqAsset(u.href)!==e.asset||Number(u.searchParams.get('wid'))!==e.width||Number(u.searchParams.get('hei'))!==e.height||u.searchParams.get('fit')!=='fit,0')return false;
 product.originalCachedImageUrl=e.cachePath;product.nativeExportEvidence={...e,selectedSku:String(product.sku),sourceUrl:product.originalImageUrl,sourceFingerprint:review.sourceFingerprint,nativeBytesVerified:true,method:'official-image-service-exact-declared-native-pixels-byte-measured'};return true;
}
