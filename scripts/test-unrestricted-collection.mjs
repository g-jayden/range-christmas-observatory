import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {unrestrictedCollection,normalizeCollectionLimits,UNRESTRICTED_LIMIT_KEYS} from '../server/collection-limits.mjs';
import {loadPolicy,planDetails,monthlyCreditLimit,collectionRunPolicy} from '../server/collection-policy.mjs';
import {reserveCredits,openCreditBudget,readLedger,periodKey,runKey} from '../server/credit-budget.mjs';
import {nextDailyPolicy} from '../server/nx-daily-policy.mjs';import {johnLewisDailyPolicy} from '../server/jl-daily-policy.mjs';import {nativePaidPolicy} from '../server/paid-native-originals.mjs';
const real=JSON.parse(await fs.readFile(new URL('../web/collection-policy.json',import.meta.url),'utf8'));
assert(unrestrictedCollection(real));for(const key of UNRESTRICTED_LIMIT_KEYS)assert.equal(real[key],null,key+' must advertise no quantity/credit ceiling');
const p=normalizeCollectionLimits(real);for(const key of UNRESTRICTED_LIMIT_KEYS)assert.equal(p[key],Infinity);assert.equal(p.accountReserveCredits,5000);assert.equal(monthlyCreditLimit(p),Infinity);assert.equal(collectionRunPolicy(real,{full:true}).maxCreditsPerRun,Infinity);
const invalid={...real,monthlyLimitAuthorization:undefined,unlimitedCollectionAuthorization:{...real.unlimitedCollectionAuthorization,paidFallback:false}};assert(!unrestrictedCollection(invalid));assert.throws(()=>monthlyCreditLimit(invalid),/authorisation/);assert(!unrestrictedCollection({...real,accountReserveCredits:4999}),'The established account reserve cannot be removed through unrestricted collection authorisation');
const products=Array.from({length:30001},(_,i)=>({sku:String(i+1),variantName:'Exact source tree '+i,kind:'tree',sourceUrl:'https://www.therange.co.uk/p/exact/#'+(i+1)}));
const plan=planDetails({products:[]},{products},{policy:p});assert.equal(plan.selected.length,30001);assert.equal(plan.deferred.length,0,'No historical 10,000-detail truncation');
assert.equal(p.maxScreenshotPagesPerRun,Infinity,'More than 1,000 NEW records cannot be deferred by a count cap');assert.equal(p.maxNativePagesPerRun,Infinity);
const legacy={...p,unlimitedCollectionAuthorization:undefined,maxCreditsPerCalendarMonth:1000,maxCreditsPerRun:2,maxDetailPagesPerRun:2,accountReserveCredits:5000};assert.equal(planDetails({products:[]},{products:products.slice(0,3)},{policy:legacy}).selected.length,2);
for(const [file,validate] of [['next-collection-authorization.json',nextDailyPolicy],['jl-collection-authorization.json',johnLewisDailyPolicy],['image-collection-authorization.json',nativePaidPolicy]]){const grant=JSON.parse(await fs.readFile(new URL('../web/'+file,import.meta.url),'utf8'));assert.equal(validate(grant).accountReserveCredits,5000);assert.throws(()=>validate({...grant,accountReserveCredits:4999}),/guard|reserve|grant/);}
const root=await fs.mkdtemp(path.join(os.tmpdir(),'all-source-unrestricted-')),cwd=process.cwd(),env=Object.fromEntries(['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_ACTIONS','COLLECTION_CHECKPOINTS','FIRECRAWL_API_KEY'].map(k=>[k,process.env[k]]));
try{
 process.chdir(root);process.env.GITHUB_RUN_ID='unrestricted-unit';process.env.GITHUB_RUN_ATTEMPT='1';delete process.env.GITHUB_ACTIONS;delete process.env.COLLECTION_CHECKPOINTS;process.env.FIRECRAWL_API_KEY='fixture-never-sent';await fs.mkdir('web');await fs.writeFile('web/collection-policy.json',JSON.stringify(real));const loaded=await loadPolicy();assert.equal(loaded.maxCreditsPerRun,Infinity);
 const period=periodKey();await fs.writeFile('web/collection-ledger.json',JSON.stringify({version:2,periods:{[period]:{used:100000,reservations:{},runs:[]}}}));
 const reserved=await reserveCredits({...loaded,maxCreditsPerRun:4},{accountRemaining:10000});assert.equal(reserved.limit,16,'A legacy caller override is a refillable hold, not a new collection cap');
 let checks=0;const budget=await openCreditBudget(loaded,{fetcher:async()=>{checks++;return Response.json({data:{remainingCredits:10000}});}});
 for(let n=0;n<7;n++)await budget.extend({additionalCredits:32});assert(budget.limit>160);assert.equal(checks,7);assert.equal((await readLedger()).periods[period].used,100000,'Reservations are never billed as use');
 const exhausted=await openCreditBudget(loaded,{fetcher:async()=>Response.json({data:{remainingCredits:5000+budget.limit}})});await assert.rejects(exhausted.extend(),/reserve/);
 await budget.settle({credits:173,receipt:{id:'actual-unit-only',credits:173,billingVerified:true}});assert.equal((await readLedger()).periods[period].used,100173);assert.equal((await readLedger()).periods[period].reservations[runKey()],undefined);
 await reserveCredits(loaded,{accountRemaining:5100});let billed=0;
 const ongoing=await openCreditBudget(loaded,{fetcher:async()=>Response.json({data:{remainingCredits:5100-billed}})});
 for(const value of [14,46,78]){billed=value;await ongoing.extend({additionalCredits:32,creditsAlreadyBilled:billed});}
 assert.equal(ongoing.limit,100,'Already billed credits cannot be subtracted again as an unpaid reservation, creating a hidden half-balance limit');
 billed=98;await assert.rejects(ongoing.extend({additionalCredits:32,creditsAlreadyBilled:billed}),/reserve/);assert.equal(ongoing.limit,100,'The established 5000-credit floor is retained even without a collection quota');
 await assert.rejects(ongoing.extend({additionalCredits:32,creditsAlreadyBilled:101}),/billing progress/);
 await ongoing.settle({credits:98,receipt:{id:'actual-with-floor-unit-only',credits:98,billingVerified:true}});
 const {createFirecrawlBrowserReader}=await import('../server/firecrawl-browser.mjs');let limit=2,extensions=0,calls=0;
 const reader=await createFirecrawlBrowserReader({policy:{...loaded,maxFallbackScrapesPerRun:1},budget:{get limit(){return limit;},extend:async()=>{extensions++;limit+=32;}},fetcher:async()=>{calls++;return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:[]}]}}});}});
 await reader.closeBrowser();for(let i=0;i<173;i++)await reader.batchDocuments(()=>[],{});await reader.close();assert.equal(calls,173);assert.equal(reader.metrics().firecrawlCredits,173);assert(extensions>1,'A successful run continues beyond both former 60/160-credit envelopes');
}finally{process.chdir(cwd);for(const[k,v]of Object.entries(env))if(v===undefined)delete process.env[k];else process.env[k]=v;await fs.rm(root,{recursive:true,force:true});}
console.log('All-retailer owner approval removes quantity/run/month/total credit stops; large detail sets and successful paid batches complete, while exact receipts, actual balance and unapproved legacy limits remain enforced.');
