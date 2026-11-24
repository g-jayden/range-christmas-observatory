// An optional owner request may narrow repair to exact current SKU records.
// It never grants permission to drop a known source record or refresh a directory.
export function evidenceRepairScope(request={}){
 if(request.sourceSearchOnly!==undefined&&typeof request.sourceSearchOnly!=='boolean')throw Error('Invalid source search-only repair flag');
 if(request.sourceSearchOnly===true&&request.detailsOnly!==true)throw Error('Source search-only repair requires detailsOnly');
 let selected=null;
 if(request.targetSkus!==undefined){
  if(!Array.isArray(request.targetSkus)||!request.targetSkus.length||request.targetSkus.some(s=>typeof s!=='string'||!/^\d+$/.test(s))||new Set(request.targetSkus).size!==request.targetSkus.length)throw Error('Invalid exact evidence repair SKU list');
  selected=new Set(request.targetSkus);
 }
 const includes=p=>!selected||selected.has(String(p.sku));
 return{includes,detailsOnly:request.detailsOnly===true,searchOnly:request.sourceSearchOnly===true,photos:snapshots=>snapshots.map(s=>({...s,products:request.detailsOnly===true?[]:s.products.filter(includes)}))};
}

export function assertResolvedEvidenceIdentity(product,detail){
 if(String(detail.sku)!==String(product.sku)||detail.exactVariantSource?.selectedSku!==String(product.sku)||product.variantId!==undefined&&String(detail.exactVariantSource?.variantId)!==String(product.variantId))throw Error('Resolved address returned another SKU or variant');
}
