import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {buildJlSnapshot,jlDirectoryAudit,jlOriginalGallery,jlPhysicalMemberships,jlSpecs,jlSourcePrices,jlDimensionFacts,jlTreeStyle} from '../server/jl-products.mjs';
import {mergeJlEvidence} from '../server/jl-evidence.mjs';import {isToday,isNew} from '../web/catalogue-model.mjs';
const d=JSON.parse(await fs.readFile('test/fixtures/jl-dom-product.json')),groupIds=['baubles','tree','topper','lights','skirt','foliage'],directory={observedAt:d.observedAt,categories:groupIds.map(id=>({id,pages:[{count:[1,1,1],rows:[{pageProductId:d.pageId,sourceUrl:d.sourceUrl,sponsored:false}]}]}))},e={products:{[d.productCode]:d},pending:[],failures:[],conflicts:[]};
assert.equal(jlDirectoryAudit(directory).length,6);const s=buildJlSnapshot(directory,e),p=s.products[0];assert.equal(p.sku,'76645627');assert.equal(p.parentGroupId,'115617144');assert.equal(p.department,'jl-baubles');assert.equal(p.price,800);assert.equal(p.originalPrice,1000);assert.match(p.material,/Foam/);assert.match(p.material,/泡沫/);assert.equal(p.dimensions.maxCm,null,'Unitless dimensions must never become guessed centimetres');assert(p.dimensionSourceNote);assert.equal(isToday(p,d.observedAt),false);assert.equal(p.sourceDescriptionAbsent,true);
for(const g of p.originalImages){assert.equal(g.selectedSku,p.sku);assert.equal(g.sourceParentId,p.parentGroupId);assert(new URL(g.url).origin==='https://media.johnlewiscontent.com');assert(!/wid=|hei=|rsp-pdp/.test(g.url));}
assert.equal(jlSourcePrices({...d,priceText:null,inStock:false}).sourceOfferUnavailable,true);assert.throws(()=>jlSourcePrices({...d,priceText:'£6.40 – £9.60'}),/selected-variant/);assert.throws(()=>buildJlSnapshot(directory,{...e,pending:[{url:d.sourceUrl}]}),/incomplete/);
const broken=structuredClone(directory);broken.categories[0].pages[0].count=[1,1,2];assert.throws(()=>jlDirectoryAudit(broken),/incomplete/);
const rows={products:{},conflicts:[]};assert.equal(mergeJlEvidence(rows,{...d,priceText:'£6.40 – £9.60'}),'family-needs-size-selection');assert.equal(Object.keys(rows.products).length,0);assert.equal(mergeJlEvidence(rows,d),'selected-variant');assert.throws(()=>mergeJlEvidence(rows,{...d,productCode:'7664562712'}),/eight-digit/);
assert.deepEqual(jlPhysicalMemberships({name:'Christmas Wreath Hanging Tree Decoration',specifications:{Dimensions:'H12cm x W12cm'}},['baubles']),['jl-baubles']);
assert.deepEqual(jlPhysicalMemberships({name:'Christmas Garland with Pine Wreath Bushy Tips'},['foliage']),['jl-garland']);
assert.deepEqual(jlPhysicalMemberships({name:'Christmas Door Wreath'},['foliage']),['jl-wreath']);
assert.deepEqual(jlPhysicalMemberships({name:'Christmas Wreath Hanger with Bells'},['foliage']),[]);
assert.deepEqual(jlPhysicalMemberships({name:'Velvet Bow Decoration',description:'Hang on a dining chair or front door as an alternative to a Christmas wreath'},['baubles']),[]);
assert.deepEqual(jlPhysicalMemberships({name:'Autumn Wreath'},['foliage']),[]);
assert.deepEqual(jlPhysicalMemberships({name:'Glass Baubles, Autumn Mix'},['baubles']),['jl-baubles']);
assert.equal(jlSpecs({specifications:{Dimensions:'H120 x W60cm'}}).Height,'120cm');
const arrival={...d,headerText:'New\n'+d.headerText,observedAt:'2026-11-16T23:01:00Z'},arrived=buildJlSnapshot({...directory,observedAt:arrival.observedAt},{...e,products:{[d.productCode]:arrival}},{previous:{products:[],notificationBaselineReady:true}}).products[0];assert(isToday(arrived,arrival.observedAt));assert(!isToday(arrived,'2026-11-17T16:00:00Z'));assert(isNew(arrived));
console.log('John Lewis directory reconciliation, exact public product code/gallery binding, true reductions, unavailable offers, variant-only prices, bilingual materials, source unit preservation, physical exclusions, baseline and Beijing midnight passed.');

const examples=JSON.parse(await fs.readFile('test/fixtures/jl-reviewed-examples.json'));const find=code=>examples.find(d=>d.productCode===code);
assert.deepEqual(jlPhysicalMemberships(find('76645653'),['baubles']),['jl-baubles']);
assert.deepEqual(jlPhysicalMemberships(find('76645502'),['baubles']),['jl-baubles']);
assert.deepEqual(jlPhysicalMemberships(find('76661207'),['skirt']),['jl-skirt']);
assert.deepEqual(jlPhysicalMemberships(find('73073318'),['baubles']),['jl-topper']);
assert.deepEqual(jlPhysicalMemberships(find('76645867'),['baubles']),['jl-baubles']);
const star=find('76684720'),starFacts=jlDimensionFacts(star,jlSpecs(star));assert.equal(starFacts.dimensions.maxCm,null);assert(starFacts.notes.length);
const bigTree=jlSpecs(find('76031139'));assert.equal(bigTree.Height,'7ft');assert.equal(bigTree.Width,'54inches');

assert.deepEqual(jlPhysicalMemberships({name:'Knitting Mouse Tree Decoration'},['baubles']),['jl-baubles']);
assert.deepEqual(jlPhysicalMemberships({name:'Chinese Lantern Wreath',description:'Perfect for decorating your home this autumn.'},['foliage']),[]);
assert.deepEqual(jlPhysicalMemberships({name:'Light Bulbs Tinsel Wreath',specifications:{Dimensions:'H50 x W50cm'}},['foliage']),['jl-wreath']);
assert.deepEqual(jlPhysicalMemberships({name:'60cm Brush Table Tree Decoration',specifications:{Height:'60cm'}},['baubles']),['jl-tree']);

assert(!new URL(buildJlSnapshot(directory,{...e,products:{[d.productCode]:{...d,sourceUrl:d.sourceUrl+'#footer'}}}).products[0].sourceUrl).hash);

// A substring match for "lit Christmas tree" must not turn an unlit tree into a pre-lit one.
assert.equal(jlTreeStyle('John Lewis Brunswick Spruce Unlit Christmas Tree, 5ft',{'Pre-lit':'Unlit'}),'标准款');
assert.equal(jlTreeStyle('John Lewis Christmas Tree',{'Pre-lit':'Pre-Lit'}),'预亮灯款');
assert.equal(jlTreeStyle('John Lewis Christmas Tree',{'Pre-lit':'Unlit'}),'标准款');
assert.equal(jlTreeStyle('John Lewis Unlit Potted Christmas Tree',{'Pre-lit':'Unlit'}),'圣诞树盆栽');

// Real production failure: Firefox reset on page 2. Preserve the exact URL and
// use the accepted same-origin page only for transient transport failures.
const {jlDirectoryTransport}=await import('../server/jl-source.mjs');let fallbackCalls=0;
const expected={url:'https://www.johnlewis.com/browse/christmas/baubles-tree-decorations/_/N-54yc?page=2',count:[25,48,64]};
assert.equal(await jlDirectoryTransport({navigate:async()=>{throw Error('page.goto: NS_ERROR_NET_RESET');},fetchHtml:async()=>{fallbackCalls++;return expected;}}),expected);
assert.equal(fallbackCalls,1);
for(const e of [Object.assign(Error('HTTP 403'),{stop:true}),Error('John Lewis directory content incomplete')])await assert.rejects(jlDirectoryTransport({navigate:async()=>{throw e;},fetchHtml:async()=>{fallbackCalls++;}}));
assert.equal(fallbackCalls,1,'Explicit refusal and invalid content cannot trigger alternate transport');
