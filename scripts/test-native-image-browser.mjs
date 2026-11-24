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
await assert.rejects(nativeImage({...product(),browseDetailsPending:true}),/Exact product record is still loading/);assert.equal(requests,0,'A compact browse row cannot download a thumbnail as an original before its exact record loads');
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

let draws=0;const labels=[];
globalThis.document={createElement:()=>{const canvas={width:0,height:0,getContext:()=>({drawImage(){draws++;},measureText:s=>({width:s.length*8}),fillRect(){},fillText:s=>labels.push(s)}),toBlob:callback=>callback(new Blob(['annotated-native-pixels'],{type:'image/png'}))};return canvas;}};
const {annotatedImage,cachedAnnotatedImage}=await import('../web/native-image-browser.mjs');
await assert.rejects(annotatedImage({...product(),priceGBP:10,browseDetailsPending:true}),/Exact product record is still loading/);assert.equal(draws,0,'No low-resolution or size-missing save image can be rendered from a pending browse row');
const named={...product(),priceGBP:10,heightLabel:'30cm'},firstAnnotated=await annotatedImage(named);assert.equal((await annotatedImage(named)),firstAnnotated);assert.equal(draws,1);assert.equal(cachedAnnotatedImage(named),firstAnnotated);
await annotatedImage({...named,priceGBP:12});assert.equal(draws,2);assert(labels.includes('£12.00'));await annotatedImage({...named,heightLabel:'40cm'});assert.equal(draws,3);assert(labels.includes('40cm'));
await assert.rejects(annotatedImage({...named,sourceImageConflict:{note:'conflict'}}),/conflict/);
console.log('Annotated native image reuse avoids repeat PNG encoding; changed source price/size and conflicting photos cannot reuse an earlier overlay.');

// Native display must not wait behind slow browser storage writes.
const normalOpen=globalThis.caches.open;let releaseWrite,writeStarted;const started=new Promise(resolve=>{writeStarted=resolve;});
globalThis.caches.open=async()=>{const db=await normalOpen();return{...db,put:async(r,v)=>{writeStarted();await new Promise(resolve=>{releaseWrite=resolve;});return db.put(r,v);}};};
pixels=new Uint8Array([255,216,10,11,12]);const slowStorage=nativeImage(product());await started;
const displayed=await Promise.race([slowStorage,new Promise((_,reject)=>setTimeout(()=>reject(Error('Native display waited for background storage')),1000))]);assert.equal(displayed.width,1800);globalThis.caches.open=normalOpen;releaseWrite();
console.log('Native display is ready while a browser persistence write remains blocked; storage persistence cannot stall original-photo display.');
