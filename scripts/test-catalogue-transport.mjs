import assert from 'node:assert/strict';
import {createCatalogueTransport} from '../server/catalogue-transport.mjs';
let calls=0,revision=1;
const read=createCatalogueTransport(async(fn,urls)=>{calls++;return urls.map(url=>({url,status:200,body:{revision}}));});
const urls=Array.from({length:25},(_,i)=>'https://search-lon.therange.co.uk/api/productlist?offset='+i);
assert.equal((await read.many(urls)).length,25);assert.equal(calls,2);
await read.many(urls);assert.equal(calls,2);
revision=2;assert.equal((await read.fresh(urls[0])).revision,2);assert.equal(calls,3);
let failedCalls=0;const failed=createCatalogueTransport(async(fn,urls)=>{failedCalls++;return urls.map(url=>({url,status:403}));});
const failures=await Promise.allSettled(urls.map(failed));assert(failures.every(r=>r.status==='rejected'&&r.reason.retryable));assert.equal(failedCalls,1);
await assert.rejects(failed('other'));assert.equal(failedCalls,1);
const wrong=createCatalogueTransport(async(fn,urls)=>urls.map(()=>({url:urls[0],status:200,body:{}})));
await assert.rejects(wrong.many(urls.slice(0,2)),/membership mismatch/);
console.log('PASS: catalogue batching, fresh verification, strict membership and bounded provider circuit');

const {createFirecrawlBrowserReader}=await import('../server/firecrawl-browser.mjs');
const {defaults}=await import('../server/collection-policy.mjs');
process.env.FIRECRAWL_API_KEY='test-only-not-sent';let paid=0;
const reader=await createFirecrawlBrowserReader({policy:{...defaults,catalogueTransport:'enhanced-batch'},budget:{limit:60},connect:()=>{throw Error('Catalogue must not open native browser')},fetcher:async(url,opts)=>{
 assert(url.endsWith('/scrape'));const input=JSON.parse(opts.body);assert.equal(input.proxy,'enhanced');assert.equal(input.skipTlsVerification,false);
 const batch=JSON.parse(input.actions[0].script.match(/\)\((\[.*\])\)$/s)[1]);paid++;
 return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:batch.map(url=>({url,status:200,body:{totalResults:0,products:[]}}))}]}}});
}});
await reader.many(urls);await reader.close();assert.equal(paid,2);assert.equal(reader.metrics().firecrawlCredits,2);assert.equal(reader.metrics().browserCredits,0);assert.equal(reader.metrics().billingVerified,true);
console.log('PASS: 25 real reader requests share two billed batches and never open native QUIC transport');

const tiny=await createFirecrawlBrowserReader({policy:{...defaults,catalogueTransport:'enhanced-batch'},budget:{limit:2},fetcher:async(url,opts)=>{assert(url.endsWith('/scrape'));const batch=JSON.parse(JSON.parse(opts.body).actions[0].script.match(/\)\((\[.*\])\)$/s)[1]);return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:batch.map(url=>({url,status:200,body:{totalResults:0,products:[]}}))}]}}})}});
await tiny(urls[0]);await assert.rejects(tiny.prepareNativeCapture(),e=>e.status===402);await tiny.close();assert.equal(tiny.metrics().firecrawlCredits,1);assert.equal(tiny.metrics().browserCredits,0);
console.log('PASS: small remaining budgets pay only for real catalogue batches; native sessions never exceed the balance');

const {fetchCataloguePages}=await import('../server/catalogue-transport.mjs');
const {Script}=await import('node:vm');
const direct=await new Script('('+fetchCataloguePages.toString()+')('+JSON.stringify([urls[0]])+')').runInNewContext({document:{querySelector:()=>({textContent:'{"totalResults":0,"products":[]}'})},location:{href:urls[0]},fetch:()=>{throw Error('The rendered first API page must not be requested twice')},URL,AbortSignal,Date});
assert.equal(direct.length,1);assert.equal(direct[0].source,'enhanced-navigation');assert.equal(direct[0].status,200);
console.log('PASS: enhanced API navigation supplies the first official JSON page without a cross-origin request');
