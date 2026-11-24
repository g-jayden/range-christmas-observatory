import https from'node:https';
// A synchronous Git checkpoint can outlive an API keep-alive socket. Use a
// new standard TLS connection, rather than resending an ambiguously lost POST.
export function fetchFirecrawlFresh(url,options={}, {request=https.request}={}){
 const target=new URL(url);if(target.origin!=='https://api.firecrawl.dev'||!['/v2/scrape','/v2/team/credit-usage'].includes(target.pathname)||target.username||target.password||target.search)throw Error('Exact Firecrawl API endpoint required');
 return new Promise((resolve,reject)=>{let settled=false;const fail=e=>{if(!settled){settled=true;reject(e);}};const req=request(target,{method:options.method||'GET',headers:options.headers,signal:options.signal,agent:false},response=>{
  // Native image batches can legitimately exceed an ordinary HTML response.
  // Stream the complete provider response with backpressure instead of imposing
  // an unrelated page-size quota or keeping a second concatenated body copy.
  let ended=false;const stream=new ReadableStream({start(controller){const broken=error=>{if(!ended){ended=true;controller.error(error);}};response.on('data',chunk=>{if(ended)return;controller.enqueue(new Uint8Array(chunk));if(controller.desiredSize<=0)response.pause?.();});response.once('error',broken);response.once('aborted',()=>broken(Error('Source response interrupted')));response.once('end',()=>{if(!ended){ended=true;controller.close();}});},pull(){response.resume?.();},cancel(reason){ended=true;response.destroy?.(reason instanceof Error?reason:undefined);}});
  try{const result=new Response(stream,{status:response.statusCode,headers:response.headers});settled=true;resolve(result);}catch(e){response.destroy?.();fail(e);}
 });req.once('error',fail);req.end(options.body);});
}
