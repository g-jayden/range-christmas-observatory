import https from'node:https';
// A synchronous Git checkpoint can outlive an API keep-alive socket. Use a
// new standard TLS connection, rather than resending an ambiguously lost POST.
export function fetchFirecrawlFresh(url,options={}, {request=https.request}={}){
 const target=new URL(url);if(target.origin!=='https://api.firecrawl.dev'||!['/v2/scrape','/v2/team/credit-usage'].includes(target.pathname)||target.username||target.password||target.search)throw Error('Exact Firecrawl API endpoint required');
 return new Promise((resolve,reject)=>{let settled=false;const fail=e=>{if(!settled){settled=true;reject(e);}};const req=request(target,{method:options.method||'GET',headers:options.headers,signal:options.signal,agent:false},response=>{const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>25000000){req.destroy(Error('Source response exceeds bounded size'));return;}chunks.push(Buffer.from(chunk));});response.once('error',fail);response.once('end',()=>{if(settled)return;settled=true;try{resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers}));}catch(e){reject(e);}});});req.once('error',fail);req.end(options.body);});
}
