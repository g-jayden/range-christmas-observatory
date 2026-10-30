export function retryingReader(reader,{attempts=3,delayMs=1500}={}){
 const run=async fn=>{for(let i=0;;i++){try{return await fn()}catch(e){const transient=e.status>=500||/ERR_TUNNEL_CONNECTION_FAILED|internal proxy|timed? ?out|ECONNRESET|fetch failed/i.test(e.message);if(!transient||i>=attempts-1||[401,402,403,429].includes(e.status))throw e;if(delayMs)await new Promise(r=>setTimeout(r,delayMs*(i+1)))}}};
 const wrapped=url=>run(()=>reader(url));if(reader.raw)wrapped.raw=(url,opts)=>run(()=>reader.raw(url,opts));return wrapped;
}
