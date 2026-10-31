import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {parseSource,collectCategory,mergeSnapshot,categories} from '../server/sync.mjs';
const seed=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));
assert.throws(()=>parseSource({success:true,data:{rawHtml:'<html>blocked</html>',metadata:{statusCode:403}}}));
const p=seed.products[0];const fake={success:true,data:{rawHtml:JSON.stringify({products:[p],totalResults:1}),metadata:{statusCode:200}}};assert.equal(parseSource(fake).products.length,1);
await assert.rejects(()=>collectCategory('test',async()=>({products:[p,p],totalResults:2})),/reconcile/);
let i=0;await assert.rejects(()=>collectCategory('test',async()=>({products:Array(120).fill(p),totalResults:i++?121:122})),/changed/);
const collected=Object.fromEntries(Object.keys(categories).map(category=>{const source=seed.sources[category];const rows=source.records.map(sku=>seed.products.find(p=>String(p.sku)===String(sku))).filter(Boolean);return [category,{products:rows,audit:{expected:rows.length,observed:rows.length,unique:rows.length,complete:true,records:rows.map(p=>p.sku),batches:[]}}]}));
const live=mergeSnapshot(seed,collected,'2026-10-30T10:00:00Z');assert.equal(live.products.filter(p=>p.kind==='skirt').length,seed.products.filter(p=>p.kind==='skirt').length);assert.equal(live.products.filter(p=>p.arrivalEvidence==='observed-after-baseline').length,seed.products.filter(p=>p.arrivalEvidence==='observed-after-baseline').length);assert(live.products.every(p=>p.observedAt==='2026-10-30T10:00:00Z'));
const cat=Object.keys(categories)[0],changed=structuredClone(collected);const target=changed[cat].products.find(p=>!p.newIn);for(const v of Object.values(changed)){for(const product of v.products){if(product.sku===target.sku){product.price=12345;product.newIn=true;product.variantImageUrl='https://www.therange.co.uk/media/updated.jpg';}}}
const next=mergeSnapshot(live,changed,'2026-10-30T10:05:00Z'),n=next.products.find(p=>p.sku===target.sku);assert.equal(n.priceGBP,123.45);assert.equal(n.newStatus,true);assert.equal(n.variantImageUrl,'https://www.therange.co.uk/media/updated.jpg');assert.equal(n.firstNewObservedAt,'2026-10-30T10:05:00Z');
const broken=structuredClone(changed);const multiple=broken[cat].products.find(p=>Object.values(broken).filter(x=>x.products.some(v=>v.sku===p.sku)).length>1);broken[cat].products=broken[cat].products.map(p=>p.sku===multiple.sku?{...p,price:2}:p);assert.throws(()=>mergeSnapshot(seed,broken),/inconsistent/);
const negativeSeed=structuredClone(seed),plain=negativeSeed.products[0];
plain.variantName='Artificial Christmas Tree - Non-Flocked';plain.features.snow=true;plain.style='雪景款';
const negativeSources=Object.fromEntries(Object.keys(categories).map(c=>{const rows=c==='artificial-trees'?[plain]:[];return [c,{products:rows,audit:{expected:rows.length,observed:rows.length,unique:rows.length,complete:true,records:rows.map(p=>p.sku),batches:[]}}]}));
const corrected=mergeSnapshot(negativeSeed,negativeSources).products.find(p=>p.sku===plain.sku);
assert.equal(corrected.features.snow,false);assert.notEqual(corrected.style,'雪景款');
assert.equal(mergeSnapshot(seed,collected,'2026-10-31T16:05:00Z').observedDate,'2026-11-01');
console.log('PASS: pagination, stock/NEW updates, tree/skirt separation, conflict rejection, and explicit Non-Flocked titles override stale snow classifications.');
