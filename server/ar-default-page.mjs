import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

// Firecrawl support's supported default route can render the requested page
// even when a cross-page fetch inside that browser is refused by the origin.
// Cache successful exact pages; never change routing identities or solve gates.
export function createArDefaultPageReader({key,fetcher=fetch,root='runtime/ar-source/isolated-pages',now=Date.now,onReceipt=async()=>{},accountReserve=5000}={}){
 if(!Number.isFinite(accountReserve)||accountReserve<5000)throw Error('Argos account reserve must be at least 5000 credits');
 let requests=0,balancePromise,remaining;
 async function read(url,{fresh=false}={}){
  const target=new URL(url);if(target.origin!=='https://www.argos.co.uk'||!/^\/(?:browse|search|product)\//.test(target.pathname))throw Error('Exact official Argos page required');
  const file=root+'/'+createHash('sha256').update(target.href).digest('hex')+'.json.gz',at=now(),day=new Date(at+28800000).toISOString().slice(0,10),cutoff=Math.max(Date.parse(day+'T07:00:00+08:00'),at-3600000);
  if(!fresh)try{const saved=JSON.parse(gunzipSync(await fs.readFile(file)));if(saved.url===target.href&&saved.status===200&&saved.receipt?.sourceStatus===200&&Date.parse(saved.observedAt)>=cutoff&&Date.parse(saved.observedAt)<=at&&typeof saved.html==='string'&&createHash('sha256').update(saved.html).digest('hex')===saved.sha256)return saved;}catch(e){if(e.code!=='ENOENT'&&e.name!=='SyntaxError'&&e.code!=='Z_DATA_ERROR')throw e;}
  balancePromise??=(async()=>{const r=await fetcher('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)}),b=await r.json();if(!r.ok||!Number.isFinite(b.data?.remainingCredits))throw Error('Argos account credit reserve could not be verified');remaining=b.data.remainingCredits;})();await balancePromise;
  if(remaining-5<accountReserve)throw Error('Argos account credit reserve reached');remaining-=5;
  const body={url:target.href,formats:['rawHtml'],onlyMainContent:false,maxAge:0,parsers:[],timeout:90000},receipt={operation:'Argos exact isolated default-route page',sourceUrl:target.href,startedAt:new Date(at).toISOString(),credits:null,billingVerified:false,pending:true};
  let result,response;requests++;
  try{
   response=await fetcher('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(110000)});result=await response.json();const d=result.data||{},m=d.metadata||{};Object.assign(receipt,{httpStatus:response.status,sourceStatus:m.statusCode,scrapeId:m.scrapeId||null,credits:m.creditsUsed??null,billingVerified:Number.isFinite(m.creditsUsed)});
   if(!response.ok||result.success!==true||m.statusCode!==200||typeof d.rawHtml!=='string'||d.rawHtml.length<100)throw Object.assign(Error('Argos isolated page HTTP '+response.status+' / '+m.statusCode),{status:m.statusCode||response.status});
   const actual=new URL(m.sourceURL||target.href);if(actual.origin!==target.origin||actual.pathname.replace(/\/$/,'')!==target.pathname.replace(/\/$/,''))throw Error('Argos isolated page returned another source URL');
   const row={url:target.href,status:200,html:d.rawHtml,observedAt:new Date(now()).toISOString(),transport:'official-default-route-isolated-page',sha256:createHash('sha256').update(d.rawHtml).digest('hex'),receipt:{...receipt,pending:false,completedAt:new Date(now()).toISOString()}};await fs.mkdir(root,{recursive:true});await fs.writeFile(file,gzipSync(JSON.stringify(row)));return row;
  }catch(e){receipt.error=String(e.message).slice(0,200);throw e;}finally{receipt.pending=false;receipt.completedAt=new Date(now()).toISOString();if(receipt.billingVerified)remaining+=5-receipt.credits;await onReceipt(receipt);}
 }
 return {read,metrics:()=>({requests})};
}
