import fs from'node:fs/promises';
import assert from'node:assert/strict';
import{parseVariantDetails}from'../server/details.mjs';
import{applySavedSingleSkuInformation}from'../server/spring-single-sku-information.mjs';
import{springDimensionFacts}from'../server/spring-dimensions.mjs';
import{springSourceText}from'../web/spring-source-facts.mjs';

const proof=JSON.parse(await fs.readFile(new URL('../web/spring-repair/single-sku-page-information.json',import.meta.url),'utf8')),record=proof.products[0],d=parseVariantDetails(record.response,record.sku,record.sourceUrl),x=d.exactVariantSource;
assert.equal(record.sku,'1438709');assert.equal(d.contentHash,record.sourceContentHash);assert(x.singleSkuPageInformation);
const p={id:String(record.response.data.familyEvidence.productId),sku:record.sku,variantId:record.variantId,sourceUrl:record.sourceUrl,variantName:'Artificial Bay Tree Pair 120cm Potted Entrance Decor - Green',detailsReady:true,sourceDescription:d.featuresText,specifications:structuredClone(d.specs),priceGBP:102.99,inStock:true,newStatus:false,firstObservedAt:'old-listing',observedAt:'old-listing',originalImageEvidence:{sha256:'saved-native-not-replaced'},detailEvidence:{selectedSku:record.sku,verifiedProductSection:true,sourceContentHash:record.sourceContentHash,observedAt:'old-detail',exactVariantSource:{...x,singleSkuPageInformation:undefined}}};
assert.equal(springDimensionFacts(p,'spring-tree').status,'unresolved');
const before=structuredClone(p),snapshot={products:[p]};assert.equal(applySavedSingleSkuInformation(snapshot,proof).applied,1);
assert.equal(springDimensionFacts(p,'spring-tree').dimensions.values.Height,120);assert.equal(p.specifications.Height,'129cm');
assert.match(springSourceText(p),/Each tree stands 120cm tall/);
const withoutProof=v=>({...v,detailEvidence:{...v.detailEvidence,exactVariantSource:null}});assert.deepEqual(withoutProof(p),withoutProof(before),'Source offers, raw specs, dates and native bytes are preserved');
for(const change of[q=>q.sourceContentHash='changed',q=>q.variantId='other',q=>q.sourceUrl='https://foreign.invalid/product',q=>q.response.data.familyEvidence.variantSkus.push('other'),q=>q.response.data.familyEvidence.offers.push({sku:'other'}),q=>q.response.data.familyEvidence.htmlAvailable=false,q=>q.response.data.familyEvidence.productId='other',q=>q.response.data.familyEvidence.information='Each tree stands 900cm tall.']){
 const bad=structuredClone(proof);change(bad.products[0]);const source={products:[structuredClone(before)]};assert.equal(applySavedSingleSkuInformation(source,bad).applied,0);assert.deepEqual(source.products[0],before);
}
const overridden=structuredClone(record.response);overridden.data.sourceVariant.desc_override=1;assert(!parseVariantDetails(overridden,p.sku,p.sourceUrl).exactVariantSource.singleSkuPageInformation);
const shared=structuredClone(record.response);shared.data.familyEvidence.variantSkus.push('other');assert(!parseVariantDetails(shared,p.sku,p.sourceUrl).exactVariantSource.singleSkuPageInformation);
console.log('PASS: a real current official single-SKU pair recovers its 120cm description, retains the conflicting raw 129cm and every offer/native/date, and rejects mixed, stale, foreign, multi-SKU or JSON-only proof.');
