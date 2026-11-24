// Resolve the same exact record for both preloading and opening. A thumbnail
// row or another SKU's details must never prepare a saveable image.
export async function resolvePreviewRecord(input,{loadProduct,readDetails}){
 const p=await loadProduct(input);if(p.browseDetailsPending)throw Error('Exact product details still pending');
 if(!p.detailsUrl)return p;
 const rows=await readDetails(p.detailsUrl),full=rows?.[p.sku];if(!full)return p;
 if(String(full.sku)!==String(p.sku)||full.sourceUrl&&full.sourceUrl!==p.sourceUrl||full.variantId!=null&&p.variantId!=null&&String(full.variantId)!==String(p.variantId))throw Error('Preview details do not match the exact SKU');
 return {...full,...p,specifications:{...full.specifications,...p.specifications},originalImages:full.originalImages||p.originalImages};
}
