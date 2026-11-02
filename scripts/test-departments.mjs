import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DEPARTMENTS,classifyDecoration,productDimensions,scopeProducts} from '../web/catalogue-model.mjs';
import {materialFacts} from '../server/appearance.mjs';
import {mergeDecorations,loadDecorationDetails,publishDecorations,readDecorations} from '../server/decorations.mjs';
import {collectPartitionedCategory} from '../server/catalogue-partitions.mjs';
assert.equal(DEPARTMENTS.length,14);assert.equal(new Set(DEPARTMENTS.map(d=>d.id)).size,14);
for(const [title,department]of [['Glitter Branch Bauble','tree-decorations'],['Frosted Eucalyptus Spray','spray'],['Snow Spray Can','ornaments'],['Teardrop Swag','swag'],['Ceramic Tealight Holder','candle-holder'],['Christmas Village Scene','scenes'],['Door Sign','wall'],['Pinecone Wreath','wreath']])assert.equal(classifyDecoration({variantName:title}).id,department,title);
assert.equal(productDimensions({Height:'1.2m',Width:'250mm'}).maxCm,120);assert.equal(productDimensions({},'Height: 25cm. Width: 12cm.').values.Height,25);assert.equal(productDimensions({Size:'10 x 20 x 30cm'}).maxCm,30);assert.equal(productDimensions({},'5m cable included').maxCm,null,'Cable length must not become the product size');
assert(materialFacts({Material:'Acrylic, Glass'},'').label.includes('亚克力'));assert(materialFacts({Material:'Polyester'},'').label.includes('涤纶（Polyester）'));
for(const d of DEPARTMENTS){const p={sku:'1',kind:d.id==='tree'||d.id==='skirt'?d.id:'decoration',department:d.id,newStatus:false,arrivalEvidence:'observed-after-baseline',firstNewObservedAt:'2026-11-02T15:59:59Z'};assert.equal(scopeProducts([p],d.id,'today','2026-11-02T15:59:59Z').length,1);assert.equal(scopeProducts([p],d.id,'today','2026-11-02T16:00:00Z').length,0);assert.equal(scopeProducts([p],d.id,'new','2026-11-02T16:00:00Z').length,1,'A prior daily arrival remains NEW after midnight, even when the source flag clears');}
const cwd=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'range-departments-'));
try{process.chdir(dir);await fs.mkdir('web');
 const row={sku:'11',variantId:'101',variantName:'Red wreath',name:'Wreath',brand:'Test',price:999,newIn:true,imageUrl:'https://www.therange.co.uk/media/one.jpg',variantImageUrl:'https://www.therange.co.uk/media/one.jpg',variantPath:'p/test/p11#11',productPath:'p/test/p11'};
 let s=mergeDecorations({products:[],history:{},baselineReady:false},{products:[row],audit:{complete:true}},'2026-11-02T14:00:00Z');assert.equal(s.products[0].firstNewObservedAt,null);s.baselineReady=true;
 Object.assign(s.products[0],{detailsReady:true,attributeObservedAt:'2026-11-02T14:00:00Z',specifications:{Material:'Glass',Height:'25cm'},detailEvidence:{selectedSku:'11',verifiedProductSection:true},sourceDescription:'A red glass wreath.'});
 await publishDecorations(s);const compact=await readDecorations();const live=mergeDecorations(compact,{products:[{...row,price:1299,newIn:false}],audit:{complete:true}},'2026-11-03T00:00:00Z');await loadDecorationDetails(live.products);assert.equal(live.products[0].priceGBP,12.99,'Restoring source attributes must never overwrite current directory price');assert.equal(live.products[0].newStatus,false);assert.equal(live.products[0].specifications.Material,'Glass');
 await publishDecorations(live);const bucket=JSON.parse(await fs.readFile('web/decoration-details/11.json'));assert.equal(bucket['11'].sourceDescription,'A red glass wreath.','Daily compact publishing must retain full description and gallery evidence');
 const all=Array.from({length:320},(_,i)=>({sku:String(i+1),brand:['A','B','C','D'][Math.floor(i/80)],price:i%7,newIn:false,inStock:true,variantImageUrl:'https://www.therange.co.uk/media/'+i+'.jpg'}));
 const reader=async raw=>{const u=new URL(raw),f=JSON.parse(u.searchParams.get('filters')),b=f.brand_f;const rows=b?all.filter(p=>b.includes(p.brand)):all;return {products:rows.slice(Number(u.searchParams.get('offset')),Number(u.searchParams.get('offset'))+120),totalResults:rows.length,facets:[{id:'brand_f',options:['A','B','C','D'].map(name=>({name,count:80}))}]};};
 const collected=await collectPartitionedCategory('94578',reader);assert.equal(collected.products.length,all.length);assert.deepEqual(new Set(collected.products.map(p=>p.sku)),new Set(all.map(p=>p.sku)));assert(collected.audit.complete);
 await assert.rejects(collectPartitionedCategory('94578',async raw=>{const d=await reader(raw);if(new URL(raw).searchParams.get('facets')!=='true'){d.products=[];d.totalResults=0;}return d;}),/do not reconcile/,'A failed partition must never be presented as an exhaustive catalogue');
 console.log('PASS: all 14 midnight boundaries retain NEW, initial-baseline exclusion, product type and size safeguards, bilingual materials, cached details preserve live prices and full galleries, and exhaustive partition coverage rejects omissions.');
}finally{process.chdir(cwd);await fs.rm(dir,{recursive:true,force:true});}
