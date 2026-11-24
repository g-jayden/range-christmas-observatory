import {createHash} from'node:crypto';
const ids=p=>(p.props?.productData||[]).map(r=>String(r.id));
// A declared PLP result slot is not necessarily a distinct SKU. Accept a lower
// unique count only when every declared slot was read and the repeated slots
// are reproduced by fresh reads of each affected page, including real closure.
export async function confirmArDuplicateSlots(pages,{closing,readFresh}={}){
 const all=pages.flatMap(ids),unique=new Set(all),meta=pages[0]?.props?.productMetadata,declared=meta?.numberOfResults;if(unique.size===declared)return null;
 const total=meta?.totalPages||Math.ceil(declared/(meta?.pageSize||60));
 if(!Number.isSafeInteger(declared)||declared<1||all.length!==declared||unique.size>=declared||pages.length!==total||pages.some((p,i)=>p.props.productMetadata.currentPage!==i+1||p.props.productMetadata.numberOfResults!==declared)||closing?.props?.productMetadata.currentPage!==1||closing.props.productMetadata.numberOfResults!==declared||JSON.stringify(ids(closing))!==JSON.stringify(ids(pages[0])))throw Error('Argos duplicate slots lack a complete stable source census');
 const positions=new Map();pages.forEach((p,i)=>ids(p).forEach((sku,n)=>{if(!positions.has(sku))positions.set(sku,[]);positions.get(sku).push({page:i+1,position:n+1});}));const duplicates=[...positions].filter(([,rows])=>rows.length>1).map(([sku,positions])=>({sku,positions})),affected=[...new Set(duplicates.flatMap(d=>d.positions.map(p=>p.page)))].sort((a,b)=>a-b),confirmed=[];
 for(const page of affected){const previous=pages[page-1],fresh=page===1?closing:await readFresh(previous);if(fresh?.props?.productMetadata.currentPage!==page||fresh.props.productMetadata.numberOfResults!==declared||JSON.stringify(ids(fresh))!==JSON.stringify(ids(previous))||!Number.isFinite(Date.parse(fresh.observedAt)))throw Error('Argos repeated-SKU page changed during independent verification');confirmed.push({page,observedAt:fresh.observedAt,url:fresh.url,orderedIdsSha256:createHash('sha256').update(JSON.stringify(ids(fresh))).digest('hex')});}
 return{expected:unique.size,sourceDeclaredCount:declared,sourceDuplicateSlots:all.length-unique.size,sourceCountReconciliation:{method:'all-declared-slots-and-independently-reproduced-duplicate-SKUs',duplicates,confirmedDuplicatePages:confirmed,closingObservedAt:closing.observedAt}};
}
