import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {HB_SOURCE_CATEGORIES} from '../web/hb-model.mjs';
const run=promisify(execFile);
// Public GETs using curl's ordinary client identity. No private API, cookies,
// spoofed headers, access challenge bypass or product-page transformations.
export async function readHbNative(){
 let requests=0;const read=async path=>{requests++;const {stdout}=await run('curl',['--fail','--silent','--show-error','--max-time','25','https://home.bargains'+path],{maxBuffer:16000000});const m=stdout.match(/<script[^>]+id="__FLAREACT_DATA"[^>]*>([\s\S]*?)<\/script>/);if(!m)throw Error('Home Bargains official page state missing');const p=JSON.parse(m[1]).props;if(p.notFound)throw Error('Home Bargains official page not found');return p;};
 const [all,fresh]=await Promise.all([read('/category/676/christmas?perpage=99999'),read('/new?perpage=99999')]);for(const p of [all,fresh])if(!Array.isArray(p.productData)||p.pagination?.currentPage!==1||p.pagination?.totalPages!==1||p.pagination?.perPage!==99999||p.productData.length>=99999)throw Error('Home Bargains native ALL page incomplete');
 const rows=all.productData.filter(h=>h.filters?.category?.some(c=>c.value&&HB_SOURCE_CATEGORIES[c.code])),queue=[...new Map(rows.map(h=>[h.id,h])).values()],products=[],failures=[];
 await Promise.all(Array.from({length:8},async()=>{while(queue.length){const h=queue.shift();try{const p=await read('/product/'+h.id+'/'+h.slug),d=p.productData;if(d?.id!==h.id||!Array.isArray(d.variants)||!d.variants.length)throw Error('Home Bargains native family identity mismatch');products.push(d);}catch(e){failures.push({id:h.id,error:String(e.message).slice(0,140)});}}}));
 if(failures.length)throw Object.assign(Error('Home Bargains native source incomplete: '+failures.length+' family pages'),{sourceFailures:failures});
 return {complete:true,sourceUrl:'https://home.bargains/category/676/christmas',observedAt:new Date().toISOString(),rootTotal:all.productData.length,pagination:all.pagination,rows,newVariantIds:[...new Set(fresh.productData.flatMap(h=>(h.variants||[]).map(v=>v.id)))],newParentIds:[...new Set(fresh.productData.map(h=>h.id))],newDirectoryTotal:fresh.productData.length,products,failures:[],sourceRequests:requests,transport:'official-public-SSR-ALL-and-exact-family-pages-native',firecrawlCredits:0};
}
