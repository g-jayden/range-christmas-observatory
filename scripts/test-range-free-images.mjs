import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createFreeFirstRangeImages} from '../server/range-free-images.mjs';
const url='https://www.therange.co.uk/media/test-original.jpg',bytes=await sharp({create:{width:100,height:120,channels:3,background:'#d7318a'}}).png().toBuffer(),writes=[],calls=[];
const r=createFreeFirstRangeImages({fetcher:async()=>new Response('',{status:403}),http2:async()=>({status:200,bytes}),browserRead:async()=>{throw Error('A successful free binary response must stop the ladder');},save:async(file,b)=>writes.push({file,bytes:b})});
const result=await r.read(url);assert(result.ok);assert.equal(result.width,100);assert.equal(result.height,120);assert.equal(result.hash,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(writes[0].bytes,bytes);assert.equal(result.method,'ordinary-free-http2');assert.equal(r.attempts.length,2);await r.close();
const unavailable=createFreeFirstRangeImages({fetcher:async()=>{calls.push('http');return new Response('',{status:403});},http2:async()=>{calls.push('http2');return{status:403};},browserRead:async()=>{calls.push('browser');return{status:403};},save:async()=>assert.fail('A rejection cannot produce a source image')});
assert((await unavailable.read(url)).freeMethodsExhausted);assert((await unavailable.read(url.replace('original','second'))).freeMethodsExhausted);assert.deepEqual(calls,['http','http2','browser']);await unavailable.close();
const missing=createFreeFirstRangeImages({fetcher:async()=>new Response('',{status:404}),http2:async()=>({status:404}),browserRead:async()=>({status:404})});assert((await missing.read(url)).sourceMissing);await assert.rejects(missing.read('https://other.example/media/test.jpg'),/observed official/);await missing.close();
console.log('Native binary pixels are retained byte-for-byte; successful free HTTP/2 skips the browser, origin denials are reused only inside the execution, and three official 404 responses do not trigger paid fallback.');
let timeouts=0,missingBrowser=0;
const slow=createFreeFirstRangeImages({fetcher:async()=>{timeouts++;throw Error('fetch timed out')},http2:async()=>({status:403}),browserRead:async()=>{missingBrowser++;return{status:0,error:"Executable doesn't exist; browser not installed"}}});
for(let n=0;n<20;n++){const row=await slow.read(url.replace('original','network-'+n));assert.equal(row.freeMethodsExhausted,true);assert.equal(row.sourceMissing,false);}
assert.equal(timeouts,3,'Three different image timeouts establish a run-local channel outage; the rest of the catalogue must not repeat that timeout');assert.equal(missingBrowser,1,'A missing browser executable is a local capability failure, not a per-image retry');assert.equal(slow.attempts.length,5);
const other=await slow.read('https://kube-media-unpublished.rstore.com/media/independent.jpg');assert.equal(other.sourceMissing,false);assert.equal(timeouts,4,'An outage on one source origin cannot disable a different official image origin');await slow.close();
console.log('PASS: repeated ordinary network failures and unavailable local browsers stop per-origin retry multiplication without inventing 403/404, skipping another origin, imposing a product cap, or making a paid request.');
