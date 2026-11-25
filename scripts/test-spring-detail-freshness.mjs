import assert from 'node:assert/strict';import {springDetailRefreshNeeded} from '../server/update-spring.mjs';
const observedAt='2026-11-24T22:00:00Z',now=Date.parse('2026-11-24T23:00:00Z'),p={sku:'123',detailsReady:true,attributeObservedAt:'2026-11-23T22:01:00Z',detailEvidence:{verifiedProductSection:true,selectedSku:'123'}};
assert(springDetailRefreshNeeded(p,observedAt,{now}),'A new complete directory must not indefinitely reuse older dimensions/materials just because a title and photo URL stayed unchanged');
assert.equal(springDetailRefreshNeeded({...p,attributeObservedAt:'2026-11-24T22:01:00Z'},observedAt,{now}),false,'A resumed cycle does not pay again for already current details');
assert(springDetailRefreshNeeded({...p,detailsReady:false},observedAt,{now}));assert(springDetailRefreshNeeded({...p,detailEvidence:{verifiedProductSection:true,selectedSku:'other'}},observedAt,{now}));assert(springDetailRefreshNeeded({...p,attributeObservedAt:'2100-01-01T00:00:00Z'},observedAt,{now}));
assert.equal(springDetailRefreshNeeded(p,observedAt,{now,detailMaxAgeDays:7}),false);
console.log('PASS: full Spring observations honour the existing detail-age policy, preserve same-cycle cache reuse and never certify missing, foreign or future-dated detail evidence.');

const{selectSpringNativeImageTargets,retainSpringNativeImageEvidence}=await import('../server/spring-daily-plan.mjs');
const source='https://www.therange.co.uk/media/whole-native.jpg',thumb='https://www.therange.co.uk/media/source-thumb.jpg',sha='a'.repeat(64),offered={sku:'12',variantId:'34',sourceUrl:'https://www.therange.co.uk/p/plant/#12',priceGBP:9.99,observedAt:'source-date',listingVariantImageUrl:thumb,variantImageUrl:thumb,originalImages:[{url:source,thumbnail:thumb,selectedSku:'12',variantId:'34'}]};
assert.equal(selectSpringNativeImageTargets([offered]),1);assert.equal(offered.variantImageUrl,source);assert.equal(offered.listingVariantImageUrl,thumb);assert.equal(offered.priceGBP,9.99);assert.equal(offered.observedAt,'source-date');
offered.imageCacheEvidence={sourceUrl:thumb,sha256:sha,width:300,height:300};offered.cachedImageUrl='images/source/'+sha+'.jpg';assert.equal(retainSpringNativeImageEvidence([offered]),0,'A cached listing thumbnail cannot certify the observed full-size gallery original');
offered.imageCacheEvidence={sourceUrl:source,sha256:sha,width:1500,height:1500};assert.equal(retainSpringNativeImageEvidence([offered]),1);assert.equal(offered.originalImageEvidence.width,1500);assert.equal(offered.originalCachedImageUrl,offered.cachedImageUrl);
const foreign={...offered,sku:'other',variantImageUrl:thumb};assert.equal(selectSpringNativeImageTargets([foreign]),0);assert.equal(retainSpringNativeImageEvidence([foreign]),0);
console.log('PASS: daily NEW requests the exact offered gallery native before local classification, preserves the listing/price/date, and never certifies a 300px thumbnail or another SKU as its original.');
