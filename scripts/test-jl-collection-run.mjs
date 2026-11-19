import assert from 'node:assert/strict';import {collectJlSource} from '../server/jl-collection-run.mjs';
let free=0,paid=0;const saved={complete:false,families:{},firecrawlCredits:9},accepted={complete:true,families:{one:{}},firecrawlCredits:1},args={paidEnabled:true,readSaved:async()=>saved,collectFree:async()=>{free++;throw Error('Firefox runtime unavailable');},collectPaid:async()=>{paid++;return accepted;}};
const result=await collectJlSource(args);assert(result.complete);assert.equal(paid,1);assert.equal(result.freeTransportFailures[0].phase,'free-runtime-or-transport');
await collectJlSource({...args,collectFree:async()=>({complete:false,failures:[{error:'HTTP 403'}]})});assert.equal(paid,2);
await collectJlSource({...args,collectFree:async()=>accepted});assert.equal(paid,2,'A complete free source must not open a paid request');
assert.equal(await collectJlSource({...args,rebuilding:true,resumePaid:true}),saved);assert.equal(paid,2,'Rebuild takes priority even if resume-paid was also set');
const unavailable=await collectJlSource({...args,paidEnabled:false});assert.equal(unavailable.complete,false);assert.equal(paid,2);
await assert.rejects(collectJlSource({...args,collectPaid:async()=>{throw Error('Paid source incomplete');}}),/Paid source incomplete/);
console.log('PASS: JL free-runtime exceptions and incomplete free sources reach the authorised paid path; free success, saved rebuilds, and absent credentials never start a paid request.');
