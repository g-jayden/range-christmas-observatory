// Public SSR is parsed as JSON; source scripts are never evaluated.
export function parseMsPage(html){
 const m=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);if(!m)throw Error('M&S native SSR data missing');
 const next=JSON.parse(m[1]),p=next.props?.pageProps;if(!p)throw Error('M&S page data missing');
 const results=p.serverSideGqlResponseFed?.productPageData?.search?.results;
 if(results){if(!Number.isInteger(results.totalItems)||!Array.isArray(results.products))throw Error('M&S catalogue totals missing');return {type:'listing',total:results.totalItems,pagination:results.pagination,page:p.initPage,products:results.products.map(r=>({id:r.id,productExternalId:r.productExternalId,strokeId:r.strokeId,brand:r.brand,title:r.title,seoPath:r.seoPath,price:r.price,labels:r.labels,onlineOnly:r.onlineOnly,stockLevelIndicator:r.stockLevelIndicator,productDefinition:r.productDefinition,variants:r.variants})),query:next.query};}
 const d=p.productDetails;if(!/^P\d+$/.test(d?.productExternalId)||!Array.isArray(d.variants))throw Error('M&S exact product data missing');
 const ld=[];for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/ig))try{const v=JSON.parse(match[1]);if(v['@type']==='Product')ld.push(v);}catch{}
 const structured=ld[0],nativeImages=(Array.isArray(structured?.image)?structured.image:[structured?.image]).filter(x=>typeof x==='string'&&x.startsWith('https://assets.digitalcontent.marksandspencer.app/'));
 return {type:'product',product:{productExternalId:d.productExternalId,new:d.new,attributes:d.attributes,navigation:d.navigation,categories:d.categories,countriesData:d.countriesData,variants:d.variants.map(v=>({...v,skus:v.skus.map(s=>({...s,price:s.price?{currentPrice:s.price.currentPrice,previousPrice:s.price.previousPrice,offerText:s.price.offerText,currencyPrefix:s.price.currencyPrefix,mfPartnumber:s.price.mfPartnumber}:null}))}))},nativeImages,isOffSale:p.isOffSale,query:next.query};
}
export function msParserSource(){return '('+parseMsPage.toString()+')';}
export async function readMsPages(items){
 const parse=MS_PARSER,rows=new Array(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,items.length)},async()=>{while(cursor<items.length){const i=cursor++,item=items[i];try{const u=new URL(item.url);if(u.origin!=='https://www.marksandspencer.com'||!(/^\/l\/christmas\//.test(u.pathname)||/\/p\/(?:hbp|clp|flp)\d+$/.test(u.pathname)))throw Error('Unexpected M&S source URL');const r=await fetch(u.href,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(22000)});if(!r.ok){rows[i]={...item,status:r.status};continue;}const data=parse(await r.text());if(item.familyId&&data.product?.productExternalId!==item.familyId)throw Error('M&S family identity mismatch');rows[i]={...item,status:200,data,observedAt:new Date().toISOString()};}catch(e){rows[i]={...item,status:0,error:String(e.message).slice(0,180)};}}}));return rows;
}
export const msBatchScript=items=>'('+readMsPages.toString().replace('MS_PARSER',msParserSource())+')('+JSON.stringify(items)+')';
