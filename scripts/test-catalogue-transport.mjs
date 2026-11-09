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
const browserCalls=new Map();
const partialBrowser=await new Script('('+fetchCataloguePages.toString()+')('+JSON.stringify(urls.slice(0,3))+')').runInNewContext({fetch:async url=>{const n=(browserCalls.get(url)||0)+1;browserCalls.set(url,n);if(url===urls[1]&&n===1)throw Error('Temporary dropped connection');return {status:200,text:async()=>'{"totalResults":0,"products":[]}'};},URL,AbortSignal,Date});
assert(partialBrowser.every(r=>r.status===200&&r.body));assert.equal(browserCalls.get(urls[0]),1);assert.equal(browserCalls.get(urls[1]),2);assert.equal(browserCalls.get(urls[2]),1);
let outageFetches=0;await new Script('('+fetchCataloguePages.toString()+')('+JSON.stringify(urls.slice(0,3))+')').runInNewContext({fetch:async()=>{outageFetches++;throw Error('Provider offline');},URL,AbortSignal,Date});assert.equal(outageFetches,3,'A complete outage is not retried inside every catalogue URL');
console.log('PASS: isolated dropped connections retry once within the same billed batch; healthy pages and complete outages are not repeated');
const partialCalls=new Map();const largerPartial=await new Script('('+fetchCataloguePages.toString()+')('+JSON.stringify(urls.slice(0,20))+')').runInNewContext({fetch:async url=>{const n=(partialCalls.get(url)||0)+1;partialCalls.set(url,n);if(urls.indexOf(url)<9&&n===1)throw Error('Temporary connection failure');return {status:200,text:async()=>'{"totalResults":0,"products":[]}'};},URL,AbortSignal,Date});assert(largerPartial.every(r=>r.status===200));assert.equal([...partialCalls.values()].reduce((a,b)=>a+b,0),29,'Nine failed subrequests recover once within the original paid action, preserving eleven successes');

let repaired=0,batchExecutions=0;
const exceptional=createCatalogueTransport(async(fn,urls)=>{batchExecutions++;return urls.map(url=>url.endsWith('24')?{url,status:0,error:'Failed to fetch'}:{url,status:200,body:{revision:1}})},{recover:async()=>({revision:++repaired}),maxRepairs:2});
await exceptional.many(urls.slice(20));assert.equal(repaired,1);assert.equal(batchExecutions,1);
assert.equal((await exceptional.fresh(urls[24])).revision,2);assert.equal(batchExecutions,1,'A fresh directly verified exception does not rebuy the successful batch');
await assert.rejects(exceptional.fresh(urls[24]),e=>e.retryable);assert.equal(repaired,2,'Direct exceptions have a hard per-observation limit');
let outageRepairs=0;const outage=createCatalogueTransport(async(fn,urls)=>urls.map(url=>({url,status:0})),{recover:async()=>{outageRepairs++;return {}}});await assert.rejects(outage.many(urls));assert.equal(outageRepairs,0,'A complete provider outage never turns into per-page paid fallback');
console.log('PASS: partial batches repair only exceptional URLs, fresh counts bypass old direct caches, and route-wide outages do not fan out');

let retryCalls=0;
const retried=await createFirecrawlBrowserReader({policy:{...defaults,catalogueTransport:'enhanced-batch'},budget:{limit:5},fetcher:async(url,opts)=>{
 retryCalls++;if(retryCalls===1)return Response.json({success:false,error:'ERR_TUNNEL_CONNECTION_FAILED internal proxy error',metadata:{creditsUsed:0}},{status:500});
 const batch=JSON.parse(JSON.parse(opts.body).actions[0].script.match(/\)\((\[.*\])\)$/s)[1]);return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:batch.map(url=>({url,status:200,body:{totalResults:0,products:[]}}))}]}}});
}});
await retried(urls[0]);await retried.close();assert.equal(retryCalls,2);assert.equal(retried.metrics().firecrawlCredits,1);assert.equal(retried.metrics().proxyRetries,1);assert.equal(retried.metrics().billingVerified,true);
console.log('PASS: a provider-confirmed zero-credit proxy failure retries just its request and keeps authoritative billing');

const {collectPartitionedCategory}=await import('../server/catalogue-partitions.mjs');
const catalogueRows=Array.from({length:10381},(_,i)=>({sku:String(i+1),price:999,originalPrice:null,newIn:i%19===0,inStock:true,variantName:'Item '+i,variantImageUrl:'https://www.therange.co.uk/media/'+i+'.jpg'}));
let rootBatches=0,brandRequests=0;
const coherentReader=createCatalogueTransport(async(fn,urls)=>{rootBatches++;return urls.map(url=>{const u=new URL(url),offset=Number(u.searchParams.get('offset')),filters=JSON.parse(u.searchParams.get('filters'));if(filters.brand_f)brandRequests++;return {url,status:200,body:{products:catalogueRows.slice(offset,offset+120),totalResults:catalogueRows.length,facets:[]}};});});
const coherent=await collectPartitionedCategory('94578',coherentReader);
assert.deepEqual(new Set(coherent.products.map(p=>p.sku)),new Set(catalogueRows.map(p=>p.sku)),'Unadvertised brands and every equal-price SKU remain included');
assert.equal(coherent.audit.complete,true);assert.equal(coherent.audit.expected,10381);assert.equal(brandRequests,0);assert(rootBatches<=8,'A coherent 10k-product catalogue must not pay for both brand and root scans');
assert.equal(coherent.products.filter(p=>p.newIn).length,catalogueRows.filter(p=>p.newIn).length);
const brandedRows=catalogueRows.map((p,i)=>({...p,brand:'B'+Math.floor(i/80)})),facetBrands=Array.from({length:130},(_,i)=>({name:'B'+i,count:Math.min(80,brandedRows.length-i*80)}));let unnecessaryRootReads=0;
const brandFirst=createCatalogueTransport(async(fn,urls)=>urls.map(url=>{const u=new URL(url),f=JSON.parse(u.searchParams.get('filters')),offset=Number(u.searchParams.get('offset'));if(!f.brand_f&&u.searchParams.get('sort')==='relevance')unnecessaryRootReads++;const rows=f.brand_f?brandedRows.filter(p=>f.brand_f.includes(p.brand)):brandedRows;return {url,status:200,body:{products:rows.slice(offset,offset+120),totalResults:rows.length,facets:[{id:'brand_f',options:facetBrands}]}};}));
const branded=await collectPartitionedCategory('94578',brandFirst);assert.equal(branded.products.length,10381);assert.equal(unnecessaryRootReads,0,'The live large-index route must not buy a redundant root scan before verified brand coverage');

const missingReader=createCatalogueTransport(async(fn,urls)=>urls.map(url=>{const u=new URL(url),offset=Number(u.searchParams.get('offset'));let products=catalogueRows.slice(offset,offset+120);if(offset===10300)products=products.map(p=>p.sku==='10381'?catalogueRows[0]:p);return {url,status:200,body:{products,totalResults:catalogueRows.length,facets:[]}};}));
await assert.rejects(collectPartitionedCategory('94578',missingReader),/brand facet required/,'A matching declared count with one missing SKU must not pass the cheaper route');

let readFailures=0;const failedReader=async()=>({totalResults:200,products:catalogueRows.slice(0,120),facets:[]});failedReader.many=async()=>{readFailures++;throw Object.assign(Error('bounded provider failure'),{status:503});};
await assert.rejects(collectPartitionedCategory('94578',failedReader),/bounded provider failure/);assert.equal(readFailures,1,'A transport failure must not buy a second whole catalogue scan');
console.log('PASS: a complete 10k-SKU root costs at most eight batches; omissions and transport failures cannot become partial success');
let enhancedOnlyCalls=0;
const enhancedOnly=await createFirecrawlBrowserReader({policy:{...defaults,catalogueTransport:'enhanced-batch',nativeCaptureEnabled:false,maxFallbackScrapesPerRun:60},budget:{limit:60},connect:()=>{throw Error('Unused native session must not reserve evidence credits');},fetcher:async url=>{assert(url.endsWith('/scrape'));enhancedOnlyCalls++;return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:[]}]}}});}});
for(let n=0;n<41;n++)await enhancedOnly.batchDocuments(async()=>[],[]);
await enhancedOnly.prepareNativeCapture();
for(let n=0;n<6;n++)await enhancedOnly.batchDocuments(async()=>[],[]);
await enhancedOnly.close();assert.equal(enhancedOnlyCalls,47);assert.equal(enhancedOnly.metrics().firecrawlCredits,47);assert.equal(enhancedOnly.metrics().browserCredits,0);
console.log('PASS: 41 discovery credits leave usable evidence credits rather than being locked in an unused native session');
