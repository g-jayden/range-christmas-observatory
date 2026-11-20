import{digest}from'./collection-policy.mjs';
const scopes=['pop-up-trees','slim-christmas-trees','potted-christmas-trees','artificial-trees','prelit-christmas-trees','snowy-christmas-trees','christmas-tree-skirt'];
export function completeCatalogueDirectory(snapshot){
 const audits=snapshot?.sources,rows=snapshot?.products;if(!audits||!Array.isArray(rows)||!rows.length||scopes.some(k=>!audits[k]))return false;
 const sourceSkus=new Set();for(const key of scopes){const a=audits[key];if(a.complete!==true||a.expected!==a.observed||a.expected!==a.unique||!Array.isArray(a.records)||new Set(a.records).size!==a.unique||!a.batches?.length)return false;for(const s of a.records)sourceSkus.add(String(s));for(const b of a.batches){try{const u=new URL(b.url),f=JSON.parse(u.searchParams.get('filters')||'{}');if(u.origin!=='https://search-lon.therange.co.uk'||u.pathname!=='/api/productlist'||!f.in_stock_f?.includes('true'))return false;}catch{return false;}}}
 return Number.isFinite(Date.parse(snapshot.observedAt))&&new Set(rows.map(p=>String(p.sku))).size===rows.length&&rows.every(p=>sourceSkus.has(String(p.sku))&&p.observedAt===snapshot.observedAt&&Number.isFinite(p.priceGBP)&&p.priceGBP>=0);
}
// Saving a closed directory does not declare missing PDPs or photos verified.
// It keeps current prices/stock from being rolled back by an unrelated failure.
export function partialCatalogueCheckpoint(snapshot,{failedAt,reason}={}){
 if(!completeCatalogueDirectory(snapshot))return null;
 const result=structuredClone(snapshot);result.updatedAt=failedAt;result.fullRefreshCheckpoint={directoryComplete:true,detailsComplete:false,sourceObservedAt:result.observedAt,failedAt,reason:String(reason||'Incomplete detailed evidence').slice(0,300)};result.collectionAudit={...(result.collectionAudit||{}),completed:false,sourceObservedAt:result.observedAt,detailsComplete:false};result.revision=digest({observedAt:result.observedAt,products:result.products,sources:result.sources,excluded:result.excluded});return result;
}
