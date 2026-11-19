import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {johnLewisDailyPolicy} from '../server/jl-daily-policy.mjs';import {collectJlPaid} from '../server/jl-paid-source.mjs';import {JL_DIRECTORIES} from '../web/jl-model.mjs';
const grant={id:'fixture-jl-ongoing',retailerId:'jl',enabled:true,scheduledPaidCollection:true,scope:'ongoing-seven-category-collection',maxCreditsPerRun:null,monthlyCreditsLimit:null,accountReserveCredits:5000};
assert.equal(johnLewisDailyPolicy(grant).maxCreditsPerRun,Infinity);assert.equal(johnLewisDailyPolicy(grant).monthlyLimit,null);assert.throws(()=>johnLewisDailyPolicy({...grant,retailerId:'nx'}),/authorised/);assert.throws(()=>johnLewisDailyPolicy({...grant,enabled:false}),/authorised/);
const family=JSON.parse(await fs.readFile('test/fixtures/jl-family.json','utf8')),cwd=process.cwd(),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'jl-paid-live-contract-'));let posts=0;
try{
 process.chdir(tmp);await fs.mkdir('web',{recursive:true});await fs.writeFile('web/jl-collection-authorization.json',JSON.stringify(grant));
 const fake=async(url,options)=>{
  if(url.endsWith('/credit-usage'))return Response.json({data:{remainingCredits:100000}});
  posts++;const body=JSON.parse(options.body),directory=body.actions[0].script.includes('],true,'),rows=directory?JL_DIRECTORIES.map(([id])=>({id,pages:[{count:[1,1,1],rows:[{pageProductId:'12345',sourceUrl:'https://www.johnlewis.com/exact-source/p12345',type:'product'}]}],ranges:[]})):[{id:'12345',url:'https://www.johnlewis.com/exact-source/p12345',observedAt:new Date().toISOString(),product:family}];
  assert.equal(body.maxAge,0);assert.equal(body.proxy,'basic');return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1,scrapeId:'receipt-'+posts},actions:{javascriptReturns:[{value:{rows,failures:[],requests:directory?7:1}}]}}});
 };
 const first=await collectJlPaid({key:'fixture-not-a-secret',fetcher:fake});assert(first.complete);assert.equal(first.categories.length,JL_DIRECTORIES.length);assert.equal(first.uniqueParentCodes,1);assert.equal(posts,2);assert.equal(first.firecrawlCredits,2);
 const second=await collectJlPaid({key:'fixture-not-a-secret',fetcher:()=>{throw Error('An accepted exact same-day batch must not be purchased again')}});assert(second.complete);assert.equal(second.firecrawlCredits,0);
 const ledger=JSON.parse(await fs.readFile('web/collection-ledger.json','utf8'));assert.equal(Object.values(ledger.periods)[0].used,2);assert.equal(Object.values(ledger.periods)[0].runs.length,2,'Journal recovery must not double-book billing receipts');
 await fs.rm('web/jl/paid-daily-checkpoint.json');let failedCalls=0;const broken=async url=>url.endsWith('/credit-usage')?Response.json({data:{remainingCredits:100000}}):(failedCalls++,Promise.reject(Error('transport reset without receipt')));
 assert(!(await collectJlPaid({key:'fixture',fetcher:broken})).complete);assert.equal(failedCalls,1);
 assert(!(await collectJlPaid({key:'fixture',fetcher:broken})).complete);assert.equal(failedCalls,1,'An ambiguous provider response cannot start an automatic duplicate purchase');
 console.log('PASS: authorised ongoing JL batches have no run/month quota, reuse exact same-day paid results, reconcile durable receipts once, reject unauthorised scopes, and stop ambiguous duplicate charges.');
}finally{process.chdir(cwd);await fs.rm(tmp,{recursive:true,force:true});}

const {dispatchAdditionalDue}=await import('../cloud/additional-retailer-clock.mjs');
class ClockDB{constructor(){this.m=new Map;}async get(k){return this.m.get(k);}async put(k,v){this.m.set(k,v);}async transaction(fn){return fn(this);}}
const clockDb=new ClockDB;await clockDb.put('baseline/jl-christmas-v1',{});const clockArgs={id:'jl',storage:clockDb,env:{GITHUB_DISPATCH_TOKEN:'fixture'},fetcher:async()=>new Response(null,{status:204})};
assert(!(await dispatchAdditionalDue({...clockArgs,now:Date.parse('2026-11-18T21:59:00Z')})).due);
assert((await dispatchAdditionalDue({...clockArgs,now:Date.parse('2026-11-18T22:00:00Z')})).dispatched);
await clockDb.put('jl-monitor',{automaticArrivalChecks:true,collectionComplete:false,committedRevision:'e'.repeat(40),observedAt:'2026-11-18T22:00:00Z'});
assert((await dispatchAdditionalDue({...clockArgs,now:Date.parse('2026-11-18T22:21:00Z')})).dispatched,'An incomplete committed source must still receive a bounded recovery');
await clockDb.put('jl-monitor',{automaticArrivalChecks:true,collectionComplete:true,committedRevision:'e'.repeat(40),observedAt:'2026-11-18T22:00:00Z',evidencePending:30});
assert(!(await dispatchAdditionalDue({...clockArgs,now:Date.parse('2026-11-18T23:00:00Z')})).due,'Historical per-product review flags must not re-purchase a complete current source at 07:00');
console.log('PASS: JL sources start at 06:00 Beijing, incomplete scans recover, and a committed complete scan is not purchased again for historical review flags.');
