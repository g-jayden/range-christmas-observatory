import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {applyRangeResidualEvidence} from '../server/range-residual-evidence.mjs';
import {treeHeightConflict} from '../web/catalogue-model.mjs';
import {productSize} from '../web/product-facts.mjs';
import {mailHeightLabel} from '../server/mail-assets.mjs';
const pack=JSON.parse(await fs.readFile(new URL('../web/range-residual-reviewed-evidence.json',import.meta.url),'utf8'));
const products=pack.records.map(r=>({sku:r.sku,variantId:r.expectedVariantId,variantName:r.variantName,kind:'tree',sourceUrl:r.sourceUrl,priceGBP:12.99,newStatus:true,observedAt:'2026-11-22T17:00:00Z',firstNewObservedAt:'2026-11-21T23:00:00Z'}));
const result=applyRangeResidualEvidence([{products}],pack);assert.equal(result.uniqueSkus,20);assert.equal(result.uniqueDimensionSkus,10);
for(const[sku,review]of Object.entries(pack.dimensionReviews)){const p=products.find(p=>p.sku===sku),c=treeHeightConflict(p);assert.equal(c.usableHeightCm,review.heightCm,sku);assert.equal(c.resolution,review.method);assert.equal(productSize(p),review.heightCm+'cm');assert(!mailHeightLabel(p).includes('unconfirmed'));assert.equal(p.priceGBP,12.99);assert.equal(p.newStatus,true);assert.equal(p.firstNewObservedAt,'2026-11-21T23:00:00Z');}
assert.equal(products.find(p=>p.sku==='1576459').specifications['Christmas Tree Height'],'6ft','The raw conflicting dropdown is retained; 150cm comes from the exact official diagram and the 5ft title');
for(const sku of ['4387263','5288732','1641324','6657819','6699667','8595053','4996544'])assert.equal(treeHeightConflict(products.find(p=>p.sku===sku)).resolution,'unresolved','Contradictory title/diagram/specifications must not be marked normal: '+sku);
const p=products.find(p=>p.sku==='1576459'),future={...structuredClone(p),attributeObservedAt:'2026-11-23T00:00:00Z'};delete future.detailEvidence.dimensionReview;applyRangeResidualEvidence([{products:[future]}],pack,{now:Date.parse('2026-11-23T01:00:00Z')});assert.equal(future.attributeObservedAt,'2026-11-23T00:00:00Z');assert.equal(treeHeightConflict(future).usableHeightCm,150,'The review survives a later observation of unchanged official source fields');
const changed=structuredClone(future);delete changed.detailEvidence.dimensionReview;changed.detailEvidence.sourceContentHash='f'.repeat(64);applyRangeResidualEvidence([{products:[changed]}],pack,{now:Date.parse('2026-11-23T01:00:00Z')});assert.equal(changed.detailEvidence.dimensionReview,undefined,'A new conflicting source digest requires new corroboration');
const bad=structuredClone(pack);bad.nativeEntries[pack.dimensionReviews['1576459'].imageUrl].hash='0'.repeat(64);assert.throws(()=>applyRangeResidualEvidence([{products:[structuredClone(p)]}],bad),/bound native/);
const figure=structuredClone(pack);figure.dimensionReviews['1576459'].readingRole='adjacent-person-height';assert.throws(()=>applyRangeResidualEvidence([{products:[structuredClone(p)]}],figure),/product-height/);
console.log('Ten real exact-SKU height conflicts resolve from title-agreeing native dimension diagrams or the selected 180cm description; raw supplier fields, offers and arrivals remain intact, changed evidence is rejected, and contradictory source photos stay unresolved.');
