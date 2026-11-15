// Executed only in the real retailer origin by the existing Firecrawl browser.
// ALL is an actual option in the official product grid (perpage=99999).
export async function readHbInsideSite(){
 if(location.origin!=='https://home.bargains')throw Error('Home Bargains origin required');
 const read=async path=>{const r=await fetch(path,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Home Bargains page HTTP '+r.status);const text=await r.text(),html=new DOMParser().parseFromString(text,'text/html'),s=html.querySelector('#__FLAREACT_DATA');if(!s)throw Error('Official catalogue state missing');const p=JSON.parse(s.textContent).props;if(p.notFound)throw Error('Official page not found');return p;};
 const [all,fresh]=await Promise.all([read('/category/676/christmas?perpage=99999'),read('/new?perpage=99999')]);
 for(const p of [all,fresh])if(!Array.isArray(p.productData)||p.pagination?.currentPage!==1||p.pagination?.totalPages!==1||p.pagination?.perPage!==99999||p.productData.length>=99999)throw Error('Home Bargains ALL page incomplete');
 const categoryIds=['349','366','365','993','804','112','917','915','111'],rows=all.productData.filter(h=>h.filters?.category?.some(c=>c.value&&categoryIds.includes(c.code))),families=[...new Map(rows.map(h=>[h.id,{id:h.id,slug:h.slug}])).values()],products=[],failures=[];
 // A family is read once even when it has several colours or departments.
 const queue=[...families];await Promise.all(Array.from({length:10},async()=>{while(queue.length){const h=queue.shift();try{const p=await read('/product/'+h.id+'/'+h.slug),d=p.productData;if(d?.id!==h.id||!Array.isArray(d.variants)||!d.variants.length)throw Error('Exact source family missing');products.push(d);}catch(e){failures.push({id:h.id,error:String(e.message).slice(0,150)});}}}));
 return {complete:!failures.length,sourceUrl:'https://home.bargains/category/676/christmas',observedAt:new Date().toISOString(),rootTotal:all.productData.length,pagination:all.pagination,rows,newVariantIds:[...new Set(fresh.productData.flatMap(h=>(h.variants||[]).map(v=>v.id)))],newParentIds:[...new Set(fresh.productData.map(h=>h.id))],newDirectoryTotal:fresh.productData.length,products,failures,transport:'Firecrawl-real-origin-official-SSR-ALL-and-exact-family-pages'};
}
export const hbDirectoryScript=()=> '('+readHbInsideSite.toString()+')()';
