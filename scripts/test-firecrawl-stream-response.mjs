import assert from'node:assert/strict';
import{EventEmitter}from'node:events';
import{createHash}from'node:crypto';
import{fetchFirecrawlFresh}from'../server/firecrawl-fresh-connection.mjs';
const chunks=Array.from({length:32},(_,i)=>Buffer.alloc(1024*1024,i)),expected=createHash('sha256');for(const b of chunks)expected.update(b);let requests=0,submitted;
const result=await fetchFirecrawlFresh('https://api.firecrawl.dev/v2/scrape',{method:'POST',body:'original-batch-once'},{request:(url,options,respond)=>{
 requests++;assert.equal(url.origin,'https://api.firecrawl.dev');assert.equal(options.agent,false);const req=new EventEmitter();req.end=body=>{submitted=body;queueMicrotask(()=>{const incoming=new EventEmitter();incoming.statusCode=200;incoming.headers={'content-type':'application/octet-stream'};respond(incoming);for(const b of chunks)incoming.emit('data',b);incoming.emit('end');});};return req;
}});
const bytes=Buffer.from(await result.arrayBuffer());assert.equal(bytes.length,32*1024*1024);assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.digest('hex'));assert.equal(requests,1);assert.equal(submitted,'original-batch-once','A large successful original batch must not execute another charged POST');
let calls=0;const interrupted=await fetchFirecrawlFresh('https://api.firecrawl.dev/v2/scrape',{method:'POST'},{request:(url,options,respond)=>{calls++;const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const incoming=new EventEmitter();incoming.statusCode=200;incoming.headers={};respond(incoming);incoming.emit('data',Buffer.from('partial'));incoming.emit('error',Error('Source body connection lost'));incoming.emit('aborted');incoming.emit('end');});return req;}});
await assert.rejects(interrupted.arrayBuffer(),/connection lost/);assert.equal(calls,1,'An ambiguous lost response is reported without duplicating the paid POST');
console.log('PASS: a 32 MiB original response streams completely with byte-identical hashes; interruptions never replay paid requests.');
