import {SourceError} from './sync.mjs';

// Executed in Firecrawl's normal enhanced scrape browser. No identity changes,
// security-warning bypasses, fabricated rows or stale catalogue substitutions.
export async function fetchCataloguePages(urls){
 const results=[];let cursor=0;
 // The enhanced browser opens the first real API URL. Read its rendered JSON
 // directly, then fetch the remaining pages from the same official origin.
 if(typeof document!=='undefined'&&typeof location!=='undefined'&&location.href===urls[0])try{
  const body=JSON.parse(document.querySelector('pre')?.textContent||document.body.innerText);
  if(Array.isArray(body.products)&&Number.isInteger(body.totalResults)){results.push({url:urls[0],status:200,body,observedAt:new Date().toISOString(),source:'enhanced-navigation'});cursor=1;}
 }catch{}

 await Promise.all(Array.from({length:Math.min(8,urls.length)},async()=>{
  while(cursor<urls.length){const url=urls[cursor++];try{
   const u=new URL(url);if(u.origin!=='https://search-lon.therange.co.uk'||u.pathname!=='/api/productlist')throw Error('Unexpected catalogue endpoint');
   const r=await fetch(url,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});const text=await r.text();let body;try{body=JSON.parse(text)}catch{}
   results.push({url,status:r.status,body,observedAt:new Date().toISOString()});
  }catch(e){results.push({url,status:0,error:String(e.message).slice(0,120),...(url===urls[0]&&typeof document!=='undefined'?{navigation:{href:location.href,title:document.title,contentType:document.contentType,preCount:document.querySelectorAll('pre').length,text:document.body?.innerText?.slice(0,250)}}:{})});}}
 }));return results;
}

export function createCatalogueTransport(execute,{batchSize=24,validate=x=>x,recover,maxRepairs=4}={}){
 const cache=new Map(),queue=[],direct=new Set();let running=false,timer,failed=null,healthy=0,repairs=0;
 const fail=rows=>{const e=new SourceError('Firecrawl目录批次连接未通过；已停止重复请求，等待限次恢复',503);e.retryable=true;e.sourceTransportUnavailable=true;e.sourceStatuses=rows.map(r=>r.status);e.sourceFailures=rows.filter(r=>r.status!==200||!r.body).map(({url,status,error,navigation})=>({url,status,error,navigation}));return e;};
 const repair=async row=>{
  if(!recover||repairs>=maxRepairs||[400,401,404,422].includes(row.status))throw fail([row]);
  repairs++;const body=validate(await recover(row.url));direct.add(row.url);healthy++;return body;
 };
 async function drain(){
  if(running)return;running=true;
  try{while(queue.length){const batch=queue.splice(0,batchSize);if(failed){for(const p of batch)p.reject(failed);continue;}
   try{
    const urls=batch.map(p=>p.url),rows=await execute(fetchCataloguePages,urls);
    if(!Array.isArray(rows)||rows.length!==urls.length||new Set(rows.map(r=>r.url)).size!==urls.length||rows.some(r=>!urls.includes(r.url)))throw Error('Catalogue batch URL membership mismatch');
    const map=new Map(rows.map(r=>[r.url,r]));
    // A provider-wide failure stops at one batch. A single exceptional URL may
    // be repaired only after this observation already proved a healthy route.
    const good=rows.filter(r=>r.status===200&&r.body);healthy+=good.length;
    if(!good.length&&!(rows.length===1&&healthy>0&&recover))throw fail(rows);
    for(const p of batch){const row=map.get(p.url);p.resolve(row.status===200&&row.body?validate(row.body):await repair(row));}
   }catch(e){failed=e;for(const p of batch)p.reject(e);}
  }}finally{running=false;}
 }
 const read=url=>{if(cache.has(url))return cache.get(url);if(failed)return Promise.reject(failed);const promise=new Promise((resolve,reject)=>{queue.push({url,resolve,reject});if(!running){clearTimeout(timer);timer=setTimeout(drain,5);}});cache.set(url,promise);return promise;};
 read.many=urls=>Promise.all(urls.map(read));read.fresh=url=>{
  cache.delete(url);if(failed)return Promise.reject(failed);
  if(!direct.has(url))return read(url);
  const promise=repair({url,status:0,error:'Previously verified direct route requires a fresh response'}).catch(e=>{failed=e;throw e;});cache.set(url,promise);return promise;
 };return read;
}
