import{fetchFirecrawlFresh}from'./firecrawl-fresh-connection.mjs';
import {bmDirectoryScript} from './bm-source.mjs';
// Retry only failures which prove the HTTP connection was never established.
// A lost response after a request was sent remains an unknown receipt.
const PRECONNECT=new Set(['UND_ERR_CONNECT_TIMEOUT','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ENETUNREACH']);
export async function collectBmDirectory({key,fetcher=fetchFirecrawlFresh,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const body={url:'https://www.bmstores.co.uk/products/christmas',formats:['markdown'],onlyMainContent:false,maxAge:0,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script:bmDirectoryScript()}]};
 for(let attempt=0;attempt<2;attempt++){
  let response;try{response=await fetcher('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(115000)});}catch(e){const code=e.cause?.code||e.code;if(attempt===0&&PRECONNECT.has(code)){await pause(1000);continue;}throw Object.assign(Error('B&M collector connection failed'+(code?' ('+code+')':'')),{cause:e,requestMayHaveBeenSent:!PRECONNECT.has(code),transportCode:code});}
  const result=await response.json();return {response,result};
 }
}
