// Reads public ASDA SSR JSON as data. Never evaluates scripts from the source.
export function jsonValueAt(text,start){
 let i=start;while(/\s/.test(text[i]||'')&&i<text.length)i++;
 const open=text[i],close=open==='{'?'}':open==='['?']':null;if(!close)throw Error('Expected source JSON object');
 let depth=0,quoted=false,escaped=false;
 for(let j=i;j<text.length;j++){const c=text[j];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c===open)depth++;else if(c===close&&!--depth)return JSON.parse(text.slice(i,j+1));}
 throw Error('Incomplete source JSON');
}
export function parseAsdaPage(html,jsonValue=jsonValueAt){
 const result={};
 const product=html.match(/(?:window\.)?productData\s*=\s*/);if(product){const d=jsonValue(html,product.index+product[0].length);if(d.data?.product)result.product=d.data.product;}
 const search=html.match(/window\.searchJSON\s*=\s*/);if(search){const d=jsonValue(html,search.index+search[0].length);result.search=d.productSearch;delete result.search.productsBase64Images;result.enriched=[];const rx=/"([A-Z]*\d+)"\s*:\s*\{\s*productData:\s*/g;for(const m of html.matchAll(rx)){const p=jsonValue(html,m.index+m[0].length);if(p.id!==m[1])throw Error('ASDA embedded SKU mismatch');result.enriched.push(p);}}
 if(!result.product&&!result.search)throw Error('ASDA exact product or listing JSON missing');return result;
}
export function asdaPageParserSource(){return '(html=>('+parseAsdaPage.toString().replace('jsonValue=jsonValueAt','jsonValue')+')(html,('+jsonValueAt.toString()+')))';}
export async function fetchAsdaBatch(items){
 const parse=ASDA_PARSER,rows=new Array(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,items.length)},async()=>{while(cursor<items.length){const i=cursor++,item=items[i];try{const u=new URL(item.url);if(u.origin!=='https://direct.asda.com'||!(u.pathname.startsWith('/george/')&&(/,default,pd\.html$/.test(u.pathname)||u.pathname.startsWith('/george/christmas/')&&/,default,sc\.html$/.test(u.pathname))))throw Error('Unexpected ASDA endpoint');const r=await fetch(u.href,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(18000)});if(!r.ok){rows[i]={...item,status:r.status};continue;}const data=parse(await r.text());if(item.sku&&String(data.product?.id)!==String(item.sku))throw Error('Exact ASDA SKU mismatch');rows[i]={...item,status:200,data,observedAt:new Date().toISOString()};}catch(e){rows[i]={...item,status:0,error:String(e.message).slice(0,160)};}}}));return rows;
}
export function asdaBatchScript(items){return '('+fetchAsdaBatch.toString().replace('ASDA_PARSER',asdaPageParserSource())+')('+JSON.stringify(items)+')';}
export const parseSavedAsdaPage=parseAsdaPage;
