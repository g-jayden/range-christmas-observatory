import {readHbNative} from '../server/hb-native-source.mjs';
import {hbOnboardingPolicy} from '../server/hb-credit-policy.mjs';
import {buildHbSnapshot} from '../server/hb-products.mjs';
import fs from 'node:fs/promises';
import {hbDirectoryScript} from '../server/hb-source.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {reserveCredits,openCreditBudget,readLedger,periodKey} from '../server/credit-budget.mjs';
import {publishCollectionCheckpoint} from '../server/collection-checkpoints.mjs';
import {atomicJson} from '../server/sync.mjs';
await fs.mkdir('web/hb',{recursive:true});const previous=await fs.readFile('web/hb/catalogue.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {products:[]};throw e;});
const saveSnapshot=async value=>{const snapshot=buildHbSnapshot(value,{previous});await atomicJson('web/hb/catalogue.json',snapshot);await atomicJson('web/hb/status.json',{state:'collected',observedAt:snapshot.observedAt,sourceCounts:snapshot.sourceCounts,products:snapshot.products.filter(p=>p.inStock).length,uniqueSourceSkus:snapshot.products.length,uniqueParentCodes:snapshot.sourceAudits.uniqueFamilies,details:snapshot.products.filter(p=>p.detailsReady).length,firecrawlCredits:credits});};
const day=new Date(Date.now()+28800000).toISOString().slice(0,10),due=Date.parse(day+'T07:00:00+08:00');
let credits=0;if(process.env.HB_REBUILD_ONLY==='true'){const value=JSON.parse(await fs.readFile('web/hb/source-directory.json','utf8'));if(Date.now()-Date.parse(value.observedAt)>86400000)throw Error('Home Bargains directory checkpoint is stale');await saveSnapshot(value);console.log('Rebuilt Home Bargains from the verified source checkpoint; zero source requests');process.exit(0);}
if(previous.notificationBaselineReady&&Date.parse(previous.observedAt)>=due&&process.env.HB_FORCE!=='true'){console.log('Home Bargains daily directory already verified; zero duplicate requests');process.exit(0);}
let policy=await loadPolicy();const key=process.env.FIRECRAWL_API_KEY;let nativeError=null;if(process.env.HB_ONBOARDING_FIRECRAWL!=='true'){try{const value=await readHbNative();await atomicJson('web/hb/source-directory.json',value);await saveSnapshot(value);console.log(JSON.stringify({phase:'Home Bargains fresh public native source',rootTotal:value.rootTotal,families:value.products.length,sourceRequests:value.sourceRequests,firecrawlCredits:0}));process.exit(0);}catch(e){nativeError=String(e.message).slice(0,200);console.log(JSON.stringify({phase:'Home Bargains native source unavailable; bounded Firecrawl recovery',error:nativeError}));}}policy=hbOnboardingPolicy(policy,await readLedger(),{period:periodKey(),enabled:process.env.HB_ONBOARDING_FIRECRAWL==='true'});if(!key)throw Error('Existing Firecrawl server credential is required for Home Bargains official-origin search');
let budget,receipt,verified=false;
try{
 const balance=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)}).then(r=>r.json());if(!Number.isFinite(balance.data?.remainingCredits))throw Error('Firecrawl account reserve not verified');
 await reserveCredits(policy,{accountRemaining:balance.data.remainingCredits});budget=await openCreditBudget(policy);await publishCollectionCheckpoint({stage:'hb-budget-reserved'});
 credits=1;receipt={id:null,credits:1,billingVerified:false,...(policy.authorizationId?{authorizationId:policy.authorizationId}:{}),reason:'conservative pending request charge if the response is lost'};
 const r=await fetch('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({url:'https://home.bargains/category/676/christmas',formats:['markdown'],onlyMainContent:false,proxy:'basic',maxAge:0,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script:hbDirectoryScript()}]}),signal:AbortSignal.timeout(115000)}),result=await r.json(),d=result.data,cost=d?.metadata?.creditsUsed??result.metadata?.creditsUsed;
 credits=Number.isFinite(cost)?cost:1;verified=Number.isFinite(cost);receipt={id:d?.metadata?.scrapeId||result.id||null,credits,billingVerified:verified,...(policy.authorizationId?{authorizationId:policy.authorizationId}:{})};
 if(!r.ok||result.success===false||d?.metadata?.statusCode!==200)throw Error('Home Bargains source HTTP '+r.status+' / '+d?.metadata?.statusCode);
 let value=d.actions?.javascriptReturns?.[0]?.value;if(typeof value==='string')value=JSON.parse(value);if(!value?.complete||!Array.isArray(value.products))throw Error('Home Bargains complete directory response missing');
 await atomicJson('web/hb/source-directory.json',value);await saveSnapshot(value);console.log(JSON.stringify({phase:'Home Bargains verified source',rootTotal:value.rootTotal,families:value.products.length,rows:value.rows.length,firecrawlCredits:credits}));
}catch(e){await atomicJson('web/hb/status.json',{state:'error',error:String(e.message).slice(0,1200),checkedAt:new Date().toISOString(),firecrawlCredits:credits});console.error(e.message);process.exitCode=1;}
finally{if(budget){await budget.settle({credits,receipt,report:{retailerId:'hb',firecrawlCredits:credits,billingVerified:verified,completedAt:new Date().toISOString()}});await publishCollectionCheckpoint({stage:'hb-source'});}}
