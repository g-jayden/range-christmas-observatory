import {SourceError} from './sync.mjs';

// Executed in Firecrawl's normal enhanced scrape browser. No identity changes,
// security-warning bypasses, fabricated rows or stale catalogue substitutions.
export async function fetchCataloguePages(urls){
 const results=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(8,urls.length)},async()=>{
  while(cursor<urls.length){const url=urls[cursor++];try{
   const u=new URL(url);if(u.origin!=='https://search-lon.therange.co.uk'||u.pathname!=='/api/productlist')throw Error('Unexpected catalogue endpoint');
   const r=await fetch(url,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000)});const text=await r.text();let body;try{body=JSON.parse(text)}catch{}
   results.push({url,status:r.status,body,observedAt:new Date().toISOString()});
  }catch(e){results.push({url,status:0,error:String(e.message).slice(0,120)});}}
 }));return results;
}

export function createCatalogueTransport(execute,{batchSize=24,validate=x=>x}={}){
 const cache=new Map(),queue=[];let running=false,timer,failed=null;
 const fail=rows=>{const e=new SourceError('Firecrawl目录批次连接未通过；已停止重复请求，等待限次恢复',503);e.retryable=true;e.sourceTransportUnavailable=true;e.sourceStatuses=rows.map(r=>r.status);return e;};
 async function drain(){
  if(running)return;running=true;
  try{while(queue.length){const batch=queue.splice(0,batchSize);if(failed){for(const p of batch)p.reject(failed);continue;}
   try{
    const urls=batch.map(p=>p.url),rows=await execute(fetchCataloguePages,urls);
    if(!Array.isArray(rows)||rows.length!==urls.length||new Set(rows.map(r=>r.url)).size!==urls.length||rows.some(r=>!urls.includes(r.url)))throw Error('Catalogue batch URL membership mismatch');
    const map=new Map(rows.map(r=>[r.url,r]));
    // A broken route is one provider failure, not eight new paid attempts.
    if(rows.every(r=>r.status!==200||!r.body)){failed=fail(rows);throw failed;}
    for(const p of batch){const row=map.get(p.url);try{if(row.status!==200||!row.body){const e=fail([row]);e.assetStatus=row.status;throw e;}p.resolve(validate(row.body));}catch(e){p.reject(e);}}
   }catch(e){failed=e;for(const p of batch)p.reject(e);}
  }}finally{running=false;}
 }
 const read=url=>{if(cache.has(url))return cache.get(url);if(failed)return Promise.reject(failed);const promise=new Promise((resolve,reject)=>{queue.push({url,resolve,reject});if(!running){clearTimeout(timer);timer=setTimeout(drain,5);}});cache.set(url,promise);return promise;};
 read.many=urls=>Promise.all(urls.map(read));read.fresh=url=>{cache.delete(url);return read(url)};return read;
}
