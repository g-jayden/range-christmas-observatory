import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const entries=new Map();let requests=0;
globalThis.location=new URL('https://owner.example/catalogue/');
globalThis.caches={open:async()=>({match:async r=>entries.get(r.url)?.clone(),put:async(r,v)=>entries.set(r.url,v.clone()),keys:async()=>[...entries.keys()].map(k=>new Request(k)),delete:async r=>entries.delete(r.url)})};
globalThis.createImageBitmap=async blob=>{assert(blob.size>0);return{width:1800,height:2400,close(){}};};
let pixels=new Uint8Array([255,216,1,2,3,4]);
globalThis.fetch=async url=>{requests++;assert.equal(url,'native/exact.jpg');return new Response(pixels,{headers:{'content-type':'image/jpeg'}});};
const sha=b=>createHash('sha256').update(b).digest('hex'),source='https://cdn.next.co.uk/exact-original.jpg';
const product=()=>({retailerId:'nx',sku:'one',originalImageUrl:source,originalCachedImageUrl:'native/exact.jpg',originalImageEvidence:{sourceUrl:source,sha256:sha(pixels)}});
const {nativeImage}=await import('../web/native-image-browser.mjs');
const first=await nativeImage(product());assert.equal(requests,1);assert.equal(first.width,1800);assert.equal(entries.size,1);assert.equal(sha(new Uint8Array(await first.blob.arrayBuffer())),sha(pixels));
// The same official URL can be changed by its owner. Both RAM and disk reuse
// must depend on the current source digest, rather than the URL alone.
pixels=new Uint8Array([255,216,7,8,9]);const second=await nativeImage(product());assert.equal(requests,2);assert.equal(sha(new Uint8Array(await second.blob.arrayBuffer())),sha(pixels));
// A fresh module simulates a page reload; the original must survive it without
// another CDN request. A corrupt disk entry must recover from the exact source.
const reloaded=await import('../web/native-image-browser.mjs?fresh=1');await reloaded.nativeImage(product());assert.equal(requests,2);
for(const key of entries.keys())if(decodeURIComponent(key).includes(sha(pixels)))entries.set(key,new Response('bad-cache',{headers:{'content-type':'image/jpeg'}}));
const corrupt=await import('../web/native-image-browser.mjs?fresh=2');await corrupt.nativeImage(product());assert.equal(requests,3);
console.log('PASS: native bytes are SHA-verified before caching, survive reload without refetch, recover corrupt storage, and changed source digests bypass old RAM/disk pixels.');
