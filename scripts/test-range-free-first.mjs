import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createFreeFirstRangeSource} from '../server/range-free-source.mjs';
import {createFirecrawlBrowserReader,readFamilyBundle} from '../server/firecrawl-browser.mjs';
import {parseDetails} from '../server/details.mjs';
import {apiUrl} from '../server/sync.mjs';
const url=apiUrl('test'),data={products:[{sku:'100',newIn:false,inStock:true,sponsored:false,price:1000}],totalResults:1};
for(const healthy of ['http','http2','browser',null]){
 const calls=[],reader=createFreeFirstRangeSource({fetcher:async u=>{calls.push('http');return healthy==='http'?Response.json(data):new Response('Denied',{status:403});},http2:async u=>{calls.push('http2');return{status:healthy==='http2'?200:403,url:u,text:JSON.stringify(data)};},browserRead:async u=>{calls.push('browser');return{status:healthy==='browser'?200:403,url:u,text:JSON.stringify(data)};}});
 const rows=await reader.catalogues([url]);assert.equal(rows.length,healthy?1:0);assert.deepEqual(calls,healthy==='http'?['http']:healthy==='http2'?['http','http2']:['http','http2','browser']);
 if(!healthy){await reader.catalogues([apiUrl('next')]);assert.equal(calls.length,3,'An origin-wide refusal is remembered only within this run, without repeated free request storms');}
 await reader.close();
}
const source='https://www.therange.co.uk/p/exact-tree/m100/#100',variant={sku:'100',code:'100',prod_id:'44',id:'9',attributes:{Height:'60cm',Colour:'White'},product_specification:['Material: PVC'],description_html:'<p>Exact 60cm white tree description.</p>',features:['Exact SKU feature']},html='<html><head><title>Exact source tree</title><script type="application/ld+json">'+JSON.stringify({'@type':'Product',offers:{offers:[{sku:'100',image:{url:'https://www.therange.co.uk/media/source.jpg'}}]}})+'</script></head><body><input id="product_id" value="44"><ul id="product-dyn-features-ul"><li>Family feature</li></ul><div id="product-description">Complete generic introduction.</div><div id="available-imgs"><a class="rsImg" href="https://www.therange.co.uk/media/original.jpg"><img data-variant="9" src="https://www.therange.co.uk/media/source.jpg"></a></div></body></html>';
let freeCalls=0;const direct=createFreeFirstRangeSource({fetcher:async u=>{freeCalls++;return new Response(u.endsWith('?json')?JSON.stringify({variant_arr:[variant]}):html,{status:200});},http2:async()=>assert.fail('Working free HTTP must never call HTTP2'),browserRead:async()=>assert.fail('Working free HTTP must never launch a browser')});
const rows=await direct.families([{sku:'100',variantId:'9',sourceUrl:source}],readFamilyBundle);assert.equal(rows.length,1);const bundle=rows[0].bundle,detail=parseDetails({success:true,data:{metadata:{statusCode:200},sourceVariant:bundle.variants[0],familyEvidence:bundle.evidence}},'100',source);assert(detail.featuresText.includes('Complete generic introduction.'));assert(detail.featuresText.includes('Exact 60cm white tree description.'));assert.equal(detail.originalImages[0].url,'https://www.therange.co.uk/media/original.jpg');assert.equal(freeCalls,2);await direct.close();
let forbidden=0;const reject=createFreeFirstRangeSource({fetcher:async()=>{forbidden++;throw Error();}});await assert.rejects(reject.catalogues(['https://example.com/private']),/origin/);assert.equal(forbidden,0);await reject.close();
const saved=process.env.FIRECRAWL_API_KEY;process.env.FIRECRAWL_API_KEY='unit-not-a-real-key';
try{
 const policy=JSON.parse(await fs.readFile(new URL('../web/collection-policy.json',import.meta.url),'utf8')),order=[];let charged=0;
 const paid=await createFirecrawlBrowserReader({policy,budget:{limit:16},freeFetcher:async()=>{order.push('http');return new Response('Denied',{status:403});},freeHttp2:async()=>{order.push('http2');return{status:403};},freeBrowserRead:async()=>{order.push('browser');return{status:403};},fetcher:async()=>{order.push('paid');charged++;return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:[{url,status:200,body:data}]}]}}});}});
 assert.deepEqual((await paid(url)).products,data.products);await paid.close();assert.deepEqual(order,['http','http2','browser','paid']);assert.equal(charged,1);assert.equal(paid.metrics().firecrawlCredits,1);
 let unexpectedPaid=0;const free=await createFirecrawlBrowserReader({policy,budget:{limit:16},freeFetcher:async()=>Response.json(data),freeHttp2:async()=>assert.fail(),freeBrowserRead:async()=>assert.fail(),fetcher:async()=>{unexpectedPaid++;throw Error('A working free source must not use Firecrawl');}});
 assert.deepEqual((await free(url)).products,data.products);await free.close();assert.equal(unexpectedPaid,0);assert.equal(free.metrics().firecrawlCredits,0);
}finally{if(saved===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=saved;}
console.log('Free HTTP, HTTP2 and isolated ordinary browser are attempted before paid fallback; working free catalogues and exact-SKU descriptions/specifications/original galleries require zero Firecrawl credits, and paid batches contain only unresolved URLs.');
