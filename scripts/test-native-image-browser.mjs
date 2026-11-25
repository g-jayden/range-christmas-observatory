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

let draws=0;const labels=[],imagePlacements=[],captionRects=[];
globalThis.document={createElement:()=>{const canvas={width:0,height:0,getContext:()=>({drawImage(...args){draws++;imagePlacements.push(args);},measureText:s=>({width:s.length*8}),fillRect(...args){captionRects.push(args);},fillText:s=>labels.push(s)}),toBlob:callback=>callback(new Blob(['annotated-native-pixels'],{type:'image/png'}))};return canvas;}};
const {annotatedImage,cachedAnnotatedImage}=await import('../web/native-image-browser.mjs');
await assert.rejects(annotatedImage({...product(),priceGBP:10,browseDetailsPending:true}),/Exact product record is still loading/);assert.equal(draws,0,'No low-resolution or size-missing save image can be rendered from a pending browse row');
const named={...product(),priceGBP:10,heightLabel:'30cm'},firstAnnotated=await annotatedImage(named);assert.equal((await annotatedImage(named)),firstAnnotated);assert.equal(draws,1);assert.equal(cachedAnnotatedImage(named),firstAnnotated);
await annotatedImage({...named,priceGBP:12});assert.equal(draws,2);assert(labels.includes('£12.00'));await annotatedImage({...named,heightLabel:'40cm'});assert.equal(draws,3);assert(labels.includes('40cm'));
await assert.rejects(annotatedImage({...named,sourceImageConflict:{note:'conflict'}}),/conflict/);
assert.equal(firstAnnotated.nativeWidth,1800);assert.equal(firstAnnotated.nativeHeight,2400);assert.equal(firstAnnotated.width,1800);assert(firstAnnotated.height>2400);assert(captionRects.every(([,y])=>y>=2400),'Price/size backgrounds must never cover original product pixels');assert(imagePlacements.every(a=>a.length===3&&a[1]===0&&a[2]===0),'The original bitmap is drawn without resizing or cropping');
const previousFetch=globalThis.fetch,previousBitmap=globalThis.createImageBitmap;
try{
 globalThis.fetch=async()=>new Response(pixels,{headers:{'content-type':'image/jpeg'}});globalThis.createImageBitmap=async()=>({width:300,height:300,close(){}});
 const small={...named,sku:'actual-small',originalImageUrl:'https://cdn.next.co.uk/small-original.jpg',originalCachedImageUrl:'native/small.jpg',originalImageEvidence:{sourceUrl:'https://cdn.next.co.uk/small-original.jpg',sha256:sha(pixels)},specifications:{Height:'150cm',Width:'75cm',Depth:'45cm',Length:'150cm'}},beforeRects=captionRects.length,result=await annotatedImage(small);
 assert.equal(result.nativeWidth,300);assert.equal(result.nativeHeight,300);assert.equal(result.width,300,'A small official original must not be enlarged');assert(result.height>300);assert(captionRects.slice(beforeRects).every(([,y])=>y>=300),'Long bilingual measurements must go below a small original, not obscure its lower half');assert.equal(result.height,result.nativeHeight+result.captionHeight);
}finally{globalThis.fetch=previousFetch;globalThis.createImageBitmap=previousBitmap;}
console.log('Annotated native image reuse avoids repeat PNG encoding; changed source price/size and conflicting photos cannot reuse an earlier overlay.');
console.log('PASS: high- and low-resolution source images retain their complete native pixels; a separate lower caption band keeps price and dimensions at bottom-right without covering or enlarging the product.');

// Native display must not wait behind slow browser storage writes.
const normalOpen=globalThis.caches.open;let releaseWrite,writeStarted;const started=new Promise(resolve=>{writeStarted=resolve;});
globalThis.caches.open=async()=>{const db=await normalOpen();return{...db,put:async(r,v)=>{writeStarted();await new Promise(resolve=>{releaseWrite=resolve;});return db.put(r,v);}};};
pixels=new Uint8Array([255,216,10,11,12]);const slowStorage=nativeImage(product());await started;
const displayed=await Promise.race([slowStorage,new Promise((_,reject)=>setTimeout(()=>reject(Error('Native display waited for background storage')),1000))]);assert.equal(displayed.width,1800);globalThis.caches.open=normalOpen;releaseWrite();
console.log('Native display is ready while a browser persistence write remains blocked; storage persistence cannot stall original-photo display.');
// Detail originals often expose an official version and native geometry before
// a collector has stored a SHA. Those exact frames can still survive reloads.
await new Promise(setImmediate);globalThis.createImageBitmap=async()=>({width:1800,height:2400,close(){}});
const asset='https://media.diy.com/is/image/Kingfisher/detail~123_02i?scl=1',bq={retailerId:'bq',sku:'123',variantId:'123',originalImageUrl:asset,originalImages:[{url:asset,selectedSku:'123',variantId:'123',sourceVersion:'current-v1',width:1800,height:2400}]};let galleryReads=0;globalThis.fetch=async url=>{galleryReads++;if(url==='paid-native-index.json')return Response.json({entries:{}});if(new URL(url).searchParams.has('wid'))assert.equal(new URL(url).searchParams.get('wid'),'1800');return new Response(pixels,{headers:{'content-type':'image/jpeg'}});};
const firstGallery=await import('../web/native-image-browser.mjs?gallery=1');await firstGallery.nativeImage(bq,{url:asset});await new Promise(setImmediate);assert.equal(galleryReads,1);const reloadedGallery=await import('../web/native-image-browser.mjs?gallery=2');await reloadedGallery.nativeImage(bq,{url:asset});assert.equal(galleryReads,1,'Version-bound detail originals survive a page reload without another CDN request');
const nextVersion=structuredClone(bq);nextVersion.originalImages[0].sourceVersion='current-v2';await reloadedGallery.nativeImage(nextVersion,{url:asset});assert.equal(galleryReads,2,'A changed official detail-photo version cannot reuse earlier bytes');
const before=cachedAnnotatedImage({...bq,priceGBP:12,heightLabel:'20cm'},{url:asset});assert.equal(before,undefined);
await firstGallery.annotatedImage({...bq,priceGBP:12,heightLabel:'20cm'},{url:asset});assert(firstGallery.cachedAnnotatedImage({...bq,priceGBP:12,heightLabel:'20cm'},{url:asset}));assert.equal(firstGallery.cachedAnnotatedImage({...nextVersion,priceGBP:12,heightLabel:'20cm'},{url:asset}),undefined,'An overlay cannot reuse an older detail-photo version');
const reduced=await import('../web/native-image-browser.mjs?gallery=3');globalThis.createImageBitmap=async()=>({width:300,height:400,close(){}});const small=structuredClone(bq);small.originalImages[0].sourceVersion='wrong-small-version';await assert.rejects(reduced.nativeImage(small,{url:asset}),/Declared native pixels mismatch|Image service configuration unavailable|Image HTTP/);assert.throws(()=>firstGallery.cachedAnnotatedImage({...bq,sourceImageConflict:{note:'bad source'}},{url:asset}),/bad source/);
console.log('PASS: exact-SKU version-bound detail originals persist across reloads; changed source versions invalidate native/annotation caches and reduced pixel responses cannot be saved as originals.');
