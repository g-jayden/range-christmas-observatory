// The same exact SKU can be present in decorations, lights and themes. A
// compact view must retain its verified internal variant ID across those views.
export function hydrateRangeIdentity(product,records){
 const eligible=(records||[]).filter(p=>String(p.sku)===String(product.sku)&&p.sourceUrl===product.sourceUrl&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(product.sku));
 for(const p of eligible){
  // Older verified detail records stored the one internal variant in gallery
  // rows but omitted it from the product. Recover it only from an exact-SKU
  // official-gallery proof with an unambiguous, source-matching photo set.
  const gallery=p.originalImages||[],ids=[...new Set(gallery.map(g=>g.variantId).filter(v=>v!=null).map(String))],proof=p.originalSourceEvidence,base=u=>{try{const x=new URL(u);x.hash='';x.search='';return x.href.replace(/\/$/,'');}catch{return null;}};
  const sourceMatches=base(product.sourceUrl)&&base(proof?.sourceUrl)===base(product.sourceUrl)&&(!new URL(proof.sourceUrl).hash||new URL(proof.sourceUrl).hash==='#'+product.sku);
  if(product.variantId==null&&p.variantId==null&&ids.length===1&&proof?.version==='verified-official-gallery-v1'&&String(proof.selectedSku)===String(product.sku)&&sourceMatches&&gallery.length&&gallery.every(g=>String(g.variantId)===ids[0]&&base(g.source||g.sourceUrl)===base(product.sourceUrl))&&gallery.some(g=>g.url===p.originalImageUrl&&(g.thumbnail===p.variantImageUrl||g.thumbnail===p.listingVariantImageUrl)))product.variantId=ids[0];
  if(product.variantId==null&&p.variantId!=null&&p.originalImages?.some(g=>String(g.variantId)===String(p.variantId)))product.variantId=p.variantId;
  if(!product.originalImages?.length&&p.originalImages?.length)product.originalImages=structuredClone(p.originalImages);
  for(const k of ['productPath','originalImageUrl'])if(product[k]==null&&p[k]!=null)product[k]=p[k];
 }
 return product;
}
