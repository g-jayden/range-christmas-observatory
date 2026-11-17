import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {buildNextSourceRequest} from '../server/nx-paid-request.mjs';
import {nextPlpState} from '../server/nx-source.mjs';
const grant=JSON.parse(await fs.readFile('web/next-integration-authorization.json','utf8'));
if(grant.retailerId!=='nx'||!grant.enabled||grant.scope!=='current-five-category-integration')throw Error('Current Next-only integration authorization required');
const key=process.env.FIRECRAWL_API_KEY;if(!key)throw Error('Configured Firecrawl source credential missing');
const api=async(path,body)=>{const r=await fetch('https://api.firecrawl.dev/v2/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(150000)});const value=await r.json();if(!r.ok||value.success===false)throw Error('Firecrawl HTTP '+r.status+': '+String(value.error||'request failed'));return value;};
const credit=await api('team/credit-usage');const remaining=credit.data?.remainingCredits??credit.remainingCredits;
if(!Number.isFinite(remaining)||remaining<grant.accountReserveCredits+5)throw Error('Account reserve or credit verification failed');
const receipt={id:'next-source-'+Date.now(),retailerId:'nx',purpose:grant.scope,startedAt:new Date().toISOString(),maxRequests:1,maxCreditsPerRun:grant.maxCreditsPerRun,automaticRetry:false};
try{
 const response=await api('scrape',buildNextSourceRequest('business-data')),data=response.data||response;
 Object.assign(receipt,{creditsUsed:data.metadata?.creditsUsed??5,billingVerified:Number.isFinite(data.metadata?.creditsUsed),scrapeId:data.metadata?.scrapeId,sourceStatus:data.metadata?.statusCode});
 console.log('NEXT_CREDIT_RECEIPT '+JSON.stringify(receipt));
 let action=data.actions?.javascriptReturns?.[0]?.value??data.actions?.javascriptReturns?.[0];if(typeof action==='string')action=JSON.parse(action);
 if(!action?.results)throw Error('Next business source response missing');
 const payload={observedAt:new Date().toISOString(),receipt,...action};
 const encoded=gzipSync(Buffer.from(JSON.stringify(payload))).toString('base64'),chunks=encoded.match(/.{1,12000}/g)||[];
 chunks.forEach((chunk,i)=>console.log('NEXT_SOURCE_GZIP '+(i+1)+'/'+chunks.length+' '+chunk));
 console.log(JSON.stringify({results:action.results.map(d=>({kind:d.kind,url:d.url,status:d.status,bytes:d.text?.length})),creditsUsed:receipt.creditsUsed}));
 if(action.blocked||action.results.some(r=>r.status!==200))process.exitCode=1;
}catch(e){console.log('NEXT_SOURCE_FAILURE '+JSON.stringify({error:e.message,receipt}));process.exitCode=1;}
