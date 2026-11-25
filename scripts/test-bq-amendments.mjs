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

const {bqPhotoQuarantine}=await import('../server/bq-photo-quarantine.mjs');
const {cardPreviewSource,productPreviewGallery,SOURCE_PHOTO_CONFLICT_PLACEHOLDER}=await import('../web/product-preview.mjs');
const {validateBqRelease}=await import('../server/bq-release.mjs');
const {bqOriginal,bqPreview}=await import('../server/bq-images.mjs');
const sourceGallery=[asset,asset+'-second'],secondHash='b'.repeat(64),proofIndex={
 [bqImageKey(asset)]:{sha256:sha,sourceVersion:'v1',width:1000,height:1000},
 [bqImageKey(sourceGallery[1])]:{sha256:secondHash},
};
const quarantined={...p,retailerId:'bq',inStock:true,detailsReady:true,department:'bq-baubles',departmentIds:['bq-baubles'],parentGroupId:'123',
 originalImageUrl:bqOriginal(asset),originalImages:sourceGallery.map(url=>({url:bqOriginal(url),selectedSku:'123',sourceParentId:'123',variantId:'123'})),
 previewImage:{sha256:sha,cachePath:bqPreview(asset)},imageCacheEvidence:{sha256:sha},
 originalImageEvidence:{sourceVersion:'v1',width:1000,height:1000,nativeBytesVerified:false},
 previewReviewRequired:true,paletteEvidence:{needsReview:false},classificationEvidence:{requiresReview:false},
 fastPreview:{url:'https://wrong-photo.invalid/cached.jpg'},sourceImageConflict:{note:'All source bauble photos depict a bicycle computer.',sourceFingerprint:'current-source',imageHash:sha,
 galleryQuarantine:{state:'all-source-photos-mismatch',galleryFingerprint:createHash('sha256').update(JSON.stringify(sourceGallery)).digest('hex'),reviewedAt:'2026-11-24T15:00:00Z',images:[{asset,imageHash:sha},{asset:sourceGallery[1],imageHash:secondHash}]}}};
assert(bqPhotoQuarantine(quarantined,proofIndex));
assert.equal(cardPreviewSource(quarantined),SOURCE_PHOTO_CONFLICT_PLACEHOLDER,'A stale fast preview must not expose a known unrelated source photo');
assert.deepEqual(productPreviewGallery(quarantined),[]);
assert.deepEqual(productPreviewGallery({...p},quarantined),[],'Detail hydration also suppresses a quarantined gallery');
assert.throws(()=>assertProductPhoto(quarantined),/bicycle computer/);
for(const changed of [
 {...quarantined,bqSource:{rawFingerprint:'new-source'}},
 {...quarantined,previewImage:{...quarantined.previewImage,sha256:secondHash}},
 {...quarantined,originalImages:quarantined.originalImages.slice(0,1)},
 {...quarantined,sourceImageConflict:{...quarantined.sourceImageConflict,galleryQuarantine:{...quarantined.sourceImageConflict.galleryQuarantine,images:[]}}},
])assert.equal(bqPhotoQuarantine(changed,proofIndex),null,'Incomplete or stale conflict proof is not a verified quarantine');
assert.equal(bqPhotoQuarantine(quarantined,{...proofIndex,[bqImageKey(asset)]:{sha256:secondHash}}),null,'Changed source pixels require a new review');
const otherKnownBadAngle={...quarantined,originalImageUrl:bqOriginal(sourceGallery[1]),previewImage:{...quarantined.previewImage,sha256:secondHash}},allBadReview={sourceFingerprint:'current-source',imageHash:sha,sourceImageConflict:quarantined.sourceImageConflict};applyBqSourceImageConflict(otherKnownBadAngle,allBadReview,secondHash);assert(otherKnownBadAngle.sourcePhotoQuarantined);assert(bqPhotoQuarantine(otherKnownBadAngle,proofIndex),'Changing the selected angle within an exhaustively reviewed bad gallery cannot make a pet crate eligible again');const uninspectedAngle={...otherKnownBadAngle};applyBqSourceImageConflict(uninspectedAngle,allBadReview,'e'.repeat(64));assert.equal(uninspectedAngle.sourceImageConflict,undefined,'Genuinely changed pixels expire the old gallery quarantine');
const closedRelease={baselineReady:true,collectionComplete:true,sourceAudits:Array.from({length:10},()=>({complete:true,closingVerified:true,unique:1,expected:1})),imageAudit:{verified:1},products:[quarantined]},proofVisual={[bqImageKey(asset)]:{imageHash:sha}};
assert.equal(validateBqRelease(closedRelease,proofIndex,proofVisual).sourcePhotoQuarantines,1,'Explicit source-photo quarantines are reported separately, never counted as resolved photos');
for(const changed of [
 {...quarantined,sourceImageConflict:undefined},
 {...quarantined,paletteEvidence:{needsReview:true}},
 {...quarantined,classificationEvidence:{requiresReview:true}},
 {...quarantined,sourceImageConflict:{...quarantined.sourceImageConflict,galleryQuarantine:{state:'all-source-photos-mismatch'}}},
])assert.throws(()=>validateBqRelease({...closedRelease,products:[changed]},proofIndex,proofVisual),/review pending/,'The release gate must still reject unknown photo, palette and classification issues');
console.log('PASS: exhaustive source-gallery mismatches have a separate, expiring quarantine; wrong cached photos stay hidden, exports stay blocked, and unknown review failures still stop release.');

const extraAsset=asset+'-inspected',extraHash='c'.repeat(64),extraProduct={...p,originalImages:[{url:asset},{url:extraAsset}]},extraReview={...a,galleryFingerprint:createHash('sha256').update(JSON.stringify([asset,extraAsset])).digest('hex'),review:{...a.review,rejectedGallery:[{url:extraAsset,imageHash:extraHash}]},galleryEvidenceUpdates:[{asset:extraAsset,index:{sha256:extraHash,width:1000,height:1000,checkedAt:'2026-11-25T00:40:00Z'},visual:{imageHash:extraHash}}]},extraCache=()=>({index:{},visual:{},reviews:{},selections:{}}),acceptedExtra=extraCache();
assert.equal(applyBqReviewedAmendments([extraProduct],acceptedExtra,{123:extraReview}),1);assert.equal(acceptedExtra.index[bqImageKey(extraAsset)].sha256,extraHash);
for(const change of [{...extraReview,galleryEvidenceUpdates:[{...extraReview.galleryEvidenceUpdates[0],asset:asset+'-foreign'}]},{...extraReview,review:{...a.review}},{...extraReview,galleryEvidenceUpdates:[{...extraReview.galleryEvidenceUpdates[0],visual:{imageHash:sha}}]}]){const c=extraCache();assert.throws(()=>applyBqReviewedAmendments([extraProduct],c,{123:change}),/Unbound/);assert.deepEqual(c,extraCache(),'A bad inspected-gallery payload cannot partially overwrite source caches');}
const newer=extraCache();newer.index[bqImageKey(extraAsset)]={sha256:'d'.repeat(64),checkedAt:'2026-11-25T00:50:00Z'};assert.equal(applyBqReviewedAmendments([extraProduct],newer,{123:extraReview}),0);assert.equal(newer.reviews[123],undefined);
console.log('PASS: changed gallery-frame reviews update only explicitly inspected exact-SKU assets, reject foreign/forged/stale pixels atomically, and never overwrite a newer gallery.');
