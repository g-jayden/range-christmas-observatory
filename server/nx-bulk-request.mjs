import {NEXT_DIRECTORIES} from '../web/nx-model.mjs';
export function buildNextBulkRequest(){
 const collect=async directories=>{
  const origin='https://www.next.co.uk',categories=[],summaries=[],failures=[];let requests=0;
  const fetchText=async url=>{requests++;const r=await fetch(url,{cache:'no-store',...(url.startsWith('https://api.nextdirect.com/')?{headers:{'x-next-realm':'next','x-next-territory':'GB','x-next-language':'en','x-next-persona':'APlatform'}}:{}),signal:AbortSignal.timeout(20000)});if([401,403,429].includes(r.status))throw Error('Official refusal HTTP '+r.status);if(!r.ok)throw Error('Official HTTP '+r.status);return r.text();};
  const parse=html=>{const d=new DOMParser().parseFromString(html,'text/html'),s=d.querySelector('#next-plp-script')?.textContent||'',marker='_STATE_:',start=s.indexOf(marker)+marker.length;let n=0,q=false,e=false,end=-1;for(let i=start;i<s.length;i++){const c=s[i];if(q){if(e)e=false;else if(c==='\\')e=true;else if(c==='"')q=false;}else if(c==='"')q=true;else if(c==='{')n++;else if(c==='}'&&!--n){end=i+1;break;}}if(end<0)throw Error('Official directory JSON missing');const p=JSON.parse(s.slice(start,end));return {url:p.request.url,page:p.request.page,total:p.search.totalResults,items:[...p.search.items,...Object.values(p.search.itemsCache).flat()],summaries:p.productSummary.summaryItemsData};};
  try{
   for(const[id,path]of directories){
    const api=new URL('https://api.nextdirect.com/api/search/next/GB/en/v1/item-aggregation');api.search=new URLSearchParams({criteria:'www.next.co.uk'+path,type:'Category',start:'0',pagesize:'900',fields:'totalResults,items,productSummaries,filters',pageLoadTrigger:'NEXT',sliceSize:'900',providerArgs:'_br_var_5',searchTerm:''});
    const direct=JSON.parse(await fetchText(api.href));if(direct.totalResults>0&&direct.items?.length===direct.totalResults){categories.push({id,path,declared:direct.totalResults,rows:direct.items,pages:[{url:api.href,page:1,declared:direct.totalResults,observed:direct.items.length,atomic:true}]});continue;}
    let complete=false,lastError;for(let pass=0;pass<2&&!complete;pass++){
     const seen=new Map(),pages=[],cache={};let expected=null;
     try{for(let p=1;p<100;p+=9){const url=origin+path+(p===1?'':'?p='+p),state=parse(await fetchText(url));if(expected===null)expected=state.total;if(!Number.isInteger(state.total)||state.total<1)throw Error('Next non-product directory response');for(const item of state.items)seen.set(item.itemNumber,item);Object.assign(cache,state.summaries);pages.push({url:state.url,page:state.page,observed:seen.size,declared:state.total});if(seen.size>=expected)break;}
      const closing=parse(await fetchText(origin+path));for(const item of closing.items)seen.set(item.itemNumber,item);Object.assign(cache,closing.summaries);pages.push({url:closing.url,page:1,declared:closing.total,observed:seen.size,closing:true});expected=closing.total;if(seen.size!==expected)throw Error('Next incomplete directory '+id+': '+seen.size+'/'+expected);categories.push({id,path,declared:expected,rows:[...seen.values()],pages});for(const p of Object.values(cache))summaries.push({kind:'rendered-summary',data:p});complete=true;
     }catch(e){lastError=e;if(/refusal|HTTP 4/.test(e.message))throw e;}
    }if(!complete)throw lastError;
   }
   const unique=new Map(categories.flatMap(c=>c.rows).map(r=>[r.itemNumber,r]));const rows=[...unique.values()];
   for(let i=0;i<rows.length;i+=40){const ids=rows.slice(i,i+40).map(r=>r.itemNumber+'|'+r.type).join(','),url='https://api.nextdirect.com/api/edge-aggregator/product-summary/v1/index.json?realm=next&territory=GB&language=en&productIds='+encodeURIComponent(ids),data=JSON.parse(await fetchText(url));for(const item of data.items||[])summaries.push({kind:'official-summary',data:item.productData?.data?.productSummary});}
  }catch(e){failures.push({error:e.message});}
  return {categories,summaries,failures,sourceRequests:requests,complete:categories.length===5&&!failures.length};
 };
 return {url:'https://www.next.co.uk/shop/home/christmas-decorations',formats:['rawHtml'],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},skipTlsVerification:false,parsers:[],timeout:180000,actions:[{type:'executeJavascript',script:'('+collect.toString()+')('+JSON.stringify(NEXT_DIRECTORIES)+')'}]};
}
