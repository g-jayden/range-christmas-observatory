import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {applyBqReviewedAmendments} from '../server/bq-reviewed-amendments.mjs';import {bqAsset,bqImageKey} from '../server/bq-images.mjs';
const asset='https://media.diy.com/is/image/KingfisherDigital/exact-source~123_01c_MP',sha='a'.repeat(64),p={sku:'123',bqSource:{rawFingerprint:'current-source'},originalImages:[{url:asset}]},galleryFingerprint=createHash('sha256').update(JSON.stringify([bqAsset(asset)])).digest('hex'),a={sourceFingerprint:'current-source',asset,galleryFingerprint,index:{sha256:sha,width:1600,height:1600},visual:{imageHash:sha},review:{sourceFingerprint:'current-source',imageHash:sha,department:'bq-hanging'},selection:{asset,imageHash:sha}},cache={index:{},visual:{},reviews:{123:{sourceFingerprint:'old-source',colors:['红色'],exclude:true}},selections:{}};
assert.equal(applyBqReviewedAmendments([p],cache,{123:a}),1);assert.equal(cache.reviews[123].colors,undefined);assert.equal(cache.reviews[123].exclude,undefined);assert.equal(cache.reviews[123].department,'bq-hanging');assert.equal(applyBqReviewedAmendments([{...p,bqSource:{rawFingerprint:'changed-source'}}],cache,{123:a}),0);assert.equal(applyBqReviewedAmendments([{...p,originalImages:[{url:asset+'-new'}]}],cache,{123:a}),0);
console.log('PASS: exact source, gallery and pixel-bound B&Q amendments expire on source changes; stale exclusions and colours cannot be relabelled as new evidence.');

const {applyBqSourceImageConflict}=await import('../server/bq-source-conflict.mjs');
const {assertProductPhoto}=await import('../web/product-facts.mjs');
const {annotatedImage,pdfNativeImage}=await import('../web/native-image-browser.mjs');
const conflictReview={sourceFingerprint:'current-source',imageHash:sha,sourceImageConflict:{note:'Official Red & Gold title uses a Rose Gold photo'}};
const conflicted={...p};applyBqSourceImageConflict(conflicted,conflictReview,sha);
assert.throws(()=>assertProductPhoto(conflicted),/Red & Gold/);
await assert.rejects(annotatedImage(conflicted),/Red & Gold/);
await assert.rejects(pdfNativeImage(conflicted),/Red & Gold/);
for(const [product,hash]of [[{...conflicted,bqSource:{rawFingerprint:'new-source'}},sha],[{...conflicted},'b'.repeat(64)]]){
 applyBqSourceImageConflict(product,conflictReview,hash);assert.equal(product.sourceImageConflict,undefined);
}
console.log('PASS: exact-photo source conflicts cannot become labelled images or PDF photos; changed source facts or photo bytes expire the conflict.');

assert.doesNotThrow(()=>applyBqReviewedAmendments([{sku:'no-saved-source'}],{index:{},visual:{},reviews:{},selections:{}},{}),'A product with neither a saved amendment nor review must remain unchanged');

const ref={...a,referenceCurrentEvidence:true},live={index:{[bqImageKey(asset)]:{...a.index,sourceVersion:'current-version',checkedAt:'2026-11-22T00:00:00Z'}},visual:{[bqImageKey(asset)]:{imageHash:sha,quality:{scores:{whole:.9}}}},reviews:{},selections:{}};
assert.equal(applyBqReviewedAmendments([p],live,{123:ref}),1);assert.equal(live.index[bqImageKey(asset)].sourceVersion,'current-version');assert.equal(live.visual[bqImageKey(asset)].quality.scores.whole,.9);
for(const altered of [{index:{...live.index,[bqImageKey(asset)]:{...a.index,sha256:'b'.repeat(64)}},visual:live.visual},{index:live.index,visual:{}},{index:{},visual:live.visual}])assert.equal(applyBqReviewedAmendments([p],{...altered,reviews:{},selections:{}},{123:ref}),0);
console.log('PASS: compact photo reviews require matching current source pixels and native dimensions, preserve concurrent source metadata, and cannot manufacture missing image evidence.');
