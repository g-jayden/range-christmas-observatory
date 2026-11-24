import assert from 'node:assert/strict';import {createPreviewWarmer} from '../web/preview-warmup.mjs';
let active=0,peak=0,calls=0;const finishes=[];
const warmer=createPreviewWarmer({prepare:()=>{calls++;active++;peak=Math.max(peak,active);return new Promise(resolve=>finishes.push(()=>{active--;resolve({ready:true});}));},concurrency:2});
const p=i=>({retailerId:'nx',sku:String(i),priceGBP:10,variantName:'Exact product',originalImageUrl:'https://cdn.invalid/'+i+'.jpg'}),a=warmer.warm(p(1)),again=warmer.warm(p(1)),b=warmer.warm(p(2)),c=warmer.warm(p(3));assert.equal(a,again);await new Promise(setImmediate);assert.equal(calls,2);assert.equal(peak,2);warmer.clearPending();assert.equal(await c,null);finishes.splice(0).forEach(f=>f());await Promise.all([a,b]);assert.equal(calls,2);assert.equal(await warmer.warm({...p(4),sourceImageConflict:{note:'wrong image'}}),null);
console.log('Native preview warm-up coalesces the exact product, limits concurrency, cancels unused queued work and rejects known source-photo conflicts.');
await import('./test-all-gallery-warmup.mjs');
