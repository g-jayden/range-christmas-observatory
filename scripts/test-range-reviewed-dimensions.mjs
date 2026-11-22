import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {applyRangeResidualEvidence,applyRangeResidualFiles} from '../server/range-residual-evidence.mjs';
import os from 'node:os';
import path from 'node:path';
import {publishedEvidenceHealth} from '../server/published-evidence-health.mjs';
import {treeHeightConflict} from '../web/catalogue-model.mjs';
import {productSize} from '../web/product-facts.mjs';
import {mailHeightLabel} from '../server/mail-assets.mjs';
const pack=JSON.parse(await fs.readFile(new URL('../web/range-residual-reviewed-evidence.json',import.meta.url),'utf8'));
const products=pack.records.map(r=>({sku:r.sku,variantId:r.expectedVariantId,variantName:r.variantName,kind:'tree',sourceUrl:r.sourceUrl,priceGBP:12.99,newStatus:true,observedAt:'2026-11-22T17:00:00Z',firstNewObservedAt:'2026-11-21T23:00:00Z'}));
const result=applyRangeResidualEvidence([{products}],pack);assert.equal(result.uniqueSkus,pack.records.length);assert.equal(result.uniqueDimensionSkus,10);
for(const[sku,review]of Object.entries(pack.dimensionReviews)){const p=products.find(p=>p.sku===sku),c=treeHeightConflict(p);assert.equal(c.usableHeightCm,review.heightCm,sku);assert.equal(c.resolution,review.method);assert.equal(productSize(p),review.heightCm+'cm');assert(!mailHeightLabel(p).includes('unconfirmed'));assert.equal(p.priceGBP,12.99);assert.equal(p.newStatus,true);assert.equal(p.firstNewObservedAt,'2026-11-21T23:00:00Z');}
assert.equal(products.find(p=>p.sku==='1576459').specifications['Christmas Tree Height'],'6ft','The raw conflicting dropdown is retained; 150cm comes from the exact official diagram and the 5ft title');
for(const sku of ['4387263','5288732','1641324','6657819','6699667','8595053','4996544'])assert.equal(treeHeightConflict(products.find(p=>p.sku===sku)).resolution,'unresolved','Contradictory title/diagram/specifications must not be marked normal: '+sku);
const p=products.find(p=>p.sku==='1576459'),future={...structuredClone(p),attributeObservedAt:'2026-11-23T00:00:00Z'};delete future.detailEvidence.dimensionReview;applyRangeResidualEvidence([{products:[future]}],pack,{now:Date.parse('2026-11-23T01:00:00Z')});assert.equal(future.attributeObservedAt,'2026-11-23T00:00:00Z');assert.equal(treeHeightConflict(future).usableHeightCm,150,'The review survives a later observation of unchanged official source fields');
const changed=structuredClone(future);delete changed.detailEvidence.dimensionReview;changed.detailEvidence.sourceContentHash='f'.repeat(64);applyRangeResidualEvidence([{products:[changed]}],pack,{now:Date.parse('2026-11-23T01:00:00Z')});assert.equal(changed.detailEvidence.dimensionReview,undefined,'A new conflicting source digest requires new corroboration');
const bad=structuredClone(pack);bad.nativeEntries[pack.dimensionReviews['1576459'].imageUrl].hash='0'.repeat(64);assert.throws(()=>applyRangeResidualEvidence([{products:[structuredClone(p)]}],bad),/bound native/);
const figure=structuredClone(pack);figure.dimensionReviews['1576459'].readingRole='adjacent-person-height';assert.throws(()=>applyRangeResidualEvidence([{products:[structuredClone(p)]}],figure),/product-height/);
console.log('Ten real exact-SKU height conflicts resolve from title-agreeing native dimension diagrams or the selected 180cm description; raw supplier fields, offers and arrivals remain intact, changed evidence is rejected, and contradictory source photos stay unresolved.');

const root=await fs.mkdtemp(path.join(os.tmpdir(),'range-reviewed-publication-'));
try{
 const source=path.join(root,'source'),published=path.join(root,'public');await fs.mkdir(source);await fs.mkdir(published);await fs.mkdir(path.join(published,'decoration-details'));await fs.mkdir(path.join(published,'classified'));
 await fs.writeFile(path.join(source,'range-residual-reviewed-evidence.json'),JSON.stringify(pack));
 const rows=['1576459','4387263'].map(sku=>{const r=pack.records.find(r=>r.sku===sku);return{sku,variantId:r.expectedVariantId,variantName:r.variantName,kind:'tree',sourceUrl:r.sourceUrl,priceGBP:12.99,newStatus:true,observedAt:'2026-11-22T17:00:00Z',firstNewObservedAt:'2026-11-21T23:00:00Z',detailsUrl:'decoration-details/59.json'};});
 for(const name of ['catalogue','decorations','lights','themes'])await fs.writeFile(path.join(published,name+'.json'),JSON.stringify({products:name==='catalogue'||name==='decorations'?rows:[]}));
 await fs.writeFile(path.join(published,'decoration-details/59.json'),JSON.stringify(Object.fromEntries(rows.map(p=>[p.sku,p]))));await fs.writeFile(path.join(published,'classified/tree.json'),JSON.stringify({products:rows}));
 const untouched=await fs.readFile(path.join(source,'range-residual-reviewed-evidence.json'),'utf8'),result=await applyRangeResidualFiles(published,source);assert.equal(result.uniqueDimensionSkus,1);assert.equal(result.sourceRequests,0);assert.equal(result.firecrawlCredits,0);
 const health=await publishedEvidenceHealth(published);assert.equal(health.unresolvedDimensionConflictUniqueSkus,1,'Published health must audit the reviewed facts users receive, not the older raw compact cards');assert.equal(health.missingDetailsUniqueSkus,0);
 for(const file of ['catalogue.json','decorations.json','classified/tree.json','decoration-details/59.json']){const d=JSON.parse(await fs.readFile(path.join(published,file),'utf8')),p=(d.products||Object.values(d)).find(p=>p.sku==='1576459');assert.equal(treeHeightConflict(p).usableHeightCm,150);assert.equal(p.priceGBP,12.99);assert.equal(p.firstNewObservedAt,'2026-11-21T23:00:00Z');}
 assert.equal(await fs.readFile(path.join(source,'range-residual-reviewed-evidence.json'),'utf8'),untouched);assert.equal((await applyRangeResidualFiles(published,source)).changedFiles,0,'Reapplying unchanged evidence must be idempotent');
 console.log('Source-free publication preserves offers and source files while synchronising compact cards, full lazy details, classified views and actual public health counts.');
}finally{await fs.rm(root,{recursive:true,force:true});}
