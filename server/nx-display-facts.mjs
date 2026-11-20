import{nextMaterialFacts}from'./nx-appearance.mjs';
import{componentSizeFacts}from'../web/product-facts.mjs';
// Recompute derived labels from retained exact-SKU facts. Old display caches
// must not hide a material or set measurement already present in the source.
export function applyNextDisplayFacts(p){
 if(p.retailerId!=='nx'||!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku))return false;
 const before=JSON.stringify([p.material,p.appearanceSource?.materials,p.dimensions]),materials=nextMaterialFacts(p.specifications||{},p.sourceDescription||'');
 p.material=materials.label;p.appearanceSource={...p.appearanceSource,materials};
 if(!p.dimensions?.axes?.length){const components=componentSizeFacts(p);if(components)p.dimensions={...p.dimensions,...components};}
 return before!==JSON.stringify([p.material,p.appearanceSource.materials,p.dimensions]);
}
