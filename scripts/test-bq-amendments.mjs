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

const{bqMemberships}=await import('../web/bq-model.mjs'),{bqVisualTypeCompatible}=await import('../server/bq-type-evidence.mjs');
const longGarland={sku:'5056141029917',baseName:'55cm Pre-Lit Lapland Fir Christmas Wreath with 30 Warm White LEDs, Snow Flock Finish',sourceDescription:'Comes with - Christmas garland',specifications:{Design:'Christmas garland',Length:'2m',Diameter:'550mm'},dimensions:{values:{Length:200,Diameter:55},maxCm:200},bqSource:{groups:['garland'],primaryCategoryName:'Christmas garlands'}},currentPhoto={objectTop:[{id:'bq-garland',score:.3489807752565838},{id:'bq-wreath',score:.29030190592652994}]};
assert.equal(bqMemberships(longGarland,currentPhoto).primary,'bq-garland');assert.equal(bqVisualTypeCompatible(longGarland,'bq-wreath',currentPhoto).compatible,false,'A weak secondary wreath image score cannot validate a title contradicted by four official source signals');assert.equal(bqVisualTypeCompatible(longGarland,'bq-garland',currentPhoto).compatible,true);
for(const changed of [{...longGarland,specifications:{Design:'Christmas wreath'}},{...longGarland,dimensions:{values:{Length:30},maxCm:55}},{...longGarland,bqSource:{groups:['wreath'],primaryCategoryName:'Christmas wreaths'}},{...longGarland,baseName:'Wreath and Garland Set'}])assert.equal(bqMemberships(changed,currentPhoto).primary,'bq-wreath','Legitimate wreaths and complete mixed sets retain their classification');assert.equal(bqMemberships(longGarland,{objectTop:[{id:'bq-wreath',score:.7},{id:'bq-garland',score:.2}]}).primary,'bq-wreath');
console.log('PASS: the real 2m garland is classified using official Design, length, native category and the current complete-photo result; a conflicting wreath title cannot override that corroboration, while wreaths and mixed sets remain intact.');
