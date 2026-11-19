// The same exact SKU can be present in decorations, lights and themes. A
// compact view must retain its verified internal variant ID across those views.
export function hydrateRangeIdentity(product,records){
 const eligible=(records||[]).filter(p=>String(p.sku)===String(product.sku)&&p.sourceUrl===product.sourceUrl&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(product.sku));
 for(const p of eligible){
  if(product.variantId==null&&p.variantId!=null&&p.originalImages?.some(g=>String(g.variantId)===String(p.variantId)))product.variantId=p.variantId;
  if(!product.originalImages?.length&&p.originalImages?.length)product.originalImages=structuredClone(p.originalImages);
  for(const k of ['productPath','originalImageUrl'])if(product[k]==null&&p[k]!=null)product[k]=p[k];
 }
 return product;
}
