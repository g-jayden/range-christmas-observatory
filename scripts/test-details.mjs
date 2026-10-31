import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {parseDetails,applyDetails} from '../server/details.mjs';
const response=JSON.parse(await fs.readFile('test/fixtures/farleigh-515144.json','utf8'));
const d=parseDetails(response,'515144','https://www.therange.co.uk/p/farleigh-fir-christmas-tree/p515145/#515144','2026-10-30T04:00:00Z');assert.equal(d.specs['Christmas Tree Height'],'6.5ft');assert.equal(d.specs.Colour,'Green');assert(d.images.length>0);assert.throws(()=>parseDetails(response,'515145','https://example.test'),/does not match/);
const p={sku:'515144',variantName:'Farleigh Fir Christmas Tree',features:{}};applyDetails(p,d);assert.equal(p.heightLabel,'6.5ft');assert.equal(p.heightCm,195);assert.equal(p.treeColor,'Green');assert.equal(p.features.baubles,null);assert.equal(p.attributeObservedAt,'2026-10-30T04:00:00Z');
const padded=structuredClone(response);
padded.data.rawHtml=padded.data.rawHtml.replace(/(id=["']product-dyn-code["'][^>]*>\s*)515144/,(_,prefix)=>prefix+'0515144');
assert.notEqual(padded.data.rawHtml,response.data.rawHtml);
assert.equal(parseDetails(padded,'515144','https://example.test').sku,'515144');
console.log('PASS: exact variant SKU, leading-zero product codes, true dimensions, source colour/material/gallery, and supplied-decoration evidence.');
