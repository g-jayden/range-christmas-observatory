import fs from 'node:fs/promises';
import {bmDirectoryScript} from '../server/bm-source.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {reserveCredits,openCreditBudget} from '../server/credit-budget.mjs';
import {publishCollectionCheckpoint} from '../server/collection-checkpoints.mjs';
import {atomicJson} from '../server/sync.mjs';
await fs.mkdir('web/bm',{recursive:true});const policy=await loadPolicy(),key=process.env.FIRECRAWL_API_KEY;if(!key)throw Error('Existing Firecrawl server credential is required for B&M official-origin search');
let budget,credits=0,receipt,verified=false;
try{
 const balance=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)}).then(r=>r.json());if(!Number.isFinite(balance.data?.remainingCredits))throw Error('Firecrawl account reserve not verified');
 await reserveCredits(policy,{accountRemaining:balance.data.remainingCredits});budget=await openCreditBudget(policy);await publishCollectionCheckpoint({stage:'bm-budget-reserved'});
 const r=await fetch('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({url:'https://www.bmstores.co.uk/products/christmas',formats:['markdown'],onlyMainContent:false,proxy:'basic',maxAge:0,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script:bmDirectoryScript()}]}),signal:AbortSignal.timeout(115000)}),result=await r.json(),d=result.data,cost=d?.metadata?.creditsUsed??result.metadata?.creditsUsed;
 credits=Number.isFinite(cost)?cost:1;verified=Number.isFinite(cost);receipt={id:d?.metadata?.scrapeId||result.id||null,credits,billingVerified:verified};
 if(!r.ok||result.success===false||d?.metadata?.statusCode!==200)throw Error('B&M source HTTP '+r.status+' / '+d?.metadata?.statusCode);
 let value=d.actions?.javascriptReturns?.[0]?.value;if(typeof value==='string')value=JSON.parse(value);if(!value?.complete||value.categories?.length!==5)throw Error('B&M complete directory response missing');
 await atomicJson('web/bm/source-directory.json',value);await atomicJson('web/bm/status.json',{state:'directory-collected',observedAt:value.observedAt,sourceCounts:Object.fromEntries(value.categories.map(c=>[c.id,c.declared])),uniqueSourceCodes:new Set(value.categories.flatMap(c=>c.rows.map(h=>h.productcodebm))).size,firecrawlCredits:credits});console.log(JSON.stringify({phase:'B&M verified official directory',counts:value.categories.map(c=>({id:c.id,total:c.declared})),firstHitKeys:Object.keys(value.categories[0].rows[0]||{}),firecrawlCredits:credits}));
}catch(e){await atomicJson('web/bm/status.json',{state:'error',error:String(e.message).slice(0,1200),checkedAt:new Date().toISOString(),firecrawlCredits:credits});console.error(e.message);process.exitCode=1;}
finally{if(budget){await budget.settle({credits,receipt,report:{retailerId:'bm',firecrawlCredits:credits,billingVerified:verified,completedAt:new Date().toISOString()}});await publishCollectionCheckpoint({stage:'bm-source'});}}
