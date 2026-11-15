export const RETAILER_INFO={du:{name:'Dunelm',defaultScope:'du-tree',sourceOrigin:'https://www.dunelm.com'},hb:{name:'Home Bargains',defaultScope:'hb-baubles',sourceOrigin:'https://home.bargains'},'the-range':{name:'The Range',defaultScope:'tree',sourceOrigin:'https://www.therange.co.uk'},asda:{name:'ASDA · George',defaultScope:'asda-tree',sourceOrigin:'https://direct.asda.com'},bm:{name:'B&M',defaultScope:'bm-tree',sourceOrigin:'https://www.bmstores.co.uk'},ms:{name:'M&S · Marks & Spencer',defaultScope:'ms-baubles',sourceOrigin:'https://www.marksandspencer.com'}};
export const retailerForScope=id=>String(id||'').startsWith('du-')?'du':String(id||'').startsWith('hb-')?'hb':String(id||'').startsWith('bm-')?'bm':String(id||'').startsWith('ms-')?'ms':String(id||'').startsWith('asda-')?'asda':'the-range';
export const retailerName=id=>RETAILER_INFO[id]?.name||'The Range';
export const independentRetailer=p=>['asda','ms','bm','hb','du'].includes(p?.retailerId);
export const retailerStorageSku=p=>(independentRetailer(p)?p.retailerId+':':'')+String(p.sku);
export const retailerAssetId=p=>(independentRetailer(p)?p.retailerId+'-':'')+String(p.sku);

export const validRetailerSku=(retailer,sku)=>retailer==='hb'?/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(sku)):/^\d{1,12}$/.test(String(sku));
export const validRetailerAssetId=id=>/^(?:(?:asda|ms|bm|du)-)?\d{1,12}$/.test(String(id))||/^hb-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(id));
