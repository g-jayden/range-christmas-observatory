import {productRetailer} from '../web/product-facts.mjs';
export function exactNativeGalleryMember(product,image){
 if(!product?.sku||!image?.url)return false;
 if(image.selectedSku!=null)return String(image.selectedSku)===String(product.sku);
 const detail=product.detailEvidence;
 return productRetailer(product)==='the-range'&&product.variantId!=null&&String(image.variantId)===String(product.variantId)&&detail?.verifiedProductSection===true&&String(detail.selectedSku)===String(product.sku);
}
