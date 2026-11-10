export const RETAILER_INFO={'the-range':{name:'The Range',defaultScope:'tree',sourceOrigin:'https://www.therange.co.uk'},asda:{name:'ASDA · George',defaultScope:'asda-tree',sourceOrigin:'https://direct.asda.com'},bm:{name:'B&M',defaultScope:'bm-tree',sourceOrigin:'https://www.bmstores.co.uk'},ms:{name:'M&S · Marks & Spencer',defaultScope:'ms-baubles',sourceOrigin:'https://www.marksandspencer.com'}};
export const retailerForScope=id=>String(id||'').startsWith('bm-')?'bm':String(id||'').startsWith('ms-')?'ms':String(id||'').startsWith('asda-')?'asda':'the-range';
export const retailerName=id=>RETAILER_INFO[id]?.name||'The Range';
export const independentRetailer=p=>['asda','ms','bm'].includes(p?.retailerId);
export const retailerStorageSku=p=>(independentRetailer(p)?p.retailerId+':':'')+String(p.sku);
export const retailerAssetId=p=>(independentRetailer(p)?p.retailerId+'-':'')+String(p.sku);
