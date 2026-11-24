import {nextBodyPalette,nextMaterialFacts} from '../server/nx-appearance.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {nextProductFromApi,sanitiseNextApi} from '../server/nx-native-source.mjs';
import {nextSpecs,nextDimensionFacts,nextGallery} from '../server/nx-products.mjs';
import {nxPhysicalObject} from '../web/nx-physical.mjs';
import {validRetailerSku,retailerStorageSku} from '../web/retailers.mjs';
import {scopeProducts} from '../web/catalogue-model.mjs';
const config=JSON.parse(await fs.readFile('web/nx/image-path-config.json','utf8'));
const read=async id=>JSON.parse(await fs.readFile('test/fixtures/nx-api-'+id+'.json','utf8'));
const raw=await read('V52416'),p=nextProductFromApi(raw,config),option=p.options.options[0];
assert.equal(p.itemNumber,'v52416');assert.equal(option.priceUnformatted,16);
const gallery=nextGallery(p,'V52416-01');assert(gallery.length>1);assert(gallery.every(g=>g.selectedSku==='V52416-01'&&g.sourceItemCode==='V52416'&&!g.url.includes('Resize')));
const corrupt=structuredClone(raw);corrupt.stockData.options=[];assert.throws(()=>nextProductFromApi(corrupt,config),/match/);
assert.throws(()=>sanitiseNextApi({productData:{data:{style:raw.style}},stockData:raw.stockData},'OTHER1','https://www.next.co.uk/'),/identity/);
assert(validRetailerSku('nx','V52416-01'));assert(!validRetailerSku('nx','V52416/01'));assert.equal(retailerStorageSku({retailerId:'nx',sku:'V52416-01'}),'nx:V52416-01');
const tree=nextProductFromApi(await read('G79245'),config);
assert.deepEqual(nxPhysicalObject({name:tree.title,description:tree.itemDescription.toneOfVoice,groups:['nx-tree']}),['nx-tree'],'Included topper must not reclassify the whole tree');
for(const title of ['Set of 2 Christmas Trees','Green 2X Pre-lit Snowy Christmas Trees with Hessian'])assert.deepEqual(nxPhysicalObject({name:title,groups:['nx-tree']}),['nx-tree']);
assert.deepEqual(nxPhysicalObject({name:'Set of 3 Velvet Bow Christmas Garlands',groups:['nx-garland']}),['nx-garland']);
const plush=nextProductFromApi(await read('480093'),config);assert.deepEqual(nxPhysicalObject({name:plush.title,description:plush.itemDescription.toneOfVoice,groups:['nx-ornaments']}),['nx-ornaments']);
assert.deepEqual(nxPhysicalObject({name:'Pre Lit Autumn Winter Full Garland',groups:['nx-garland']}),[]);
assert.deepEqual(nxPhysicalObject({name:'Christmas Harvest Fruits Wreath',groups:['nx-wreath']}),['nx-wreath']);
const bundle=nextProductFromApi(await read('W08086'),config);assert.deepEqual(nxPhysicalObject({name:bundle.title,description:bundle.itemDescription.toneOfVoice,groups:['nx-tree']}),['nx-wreath','nx-garland','nx-tree']);
const garland=nextProductFromApi(await read('W08078'),config),specs=nextSpecs(garland,garland.options.options[0]),facts=nextDimensionFacts(garland,garland.options.options[0],specs);assert.equal(specs.Length,'1.5m');assert.equal(specs['Source Length'],'7cm');assert.equal(facts.dimensions.values.Length,150);assert(facts.notes.length);
assert.equal(nextSpecs({colour:'Red',itemDescription:{measurements:[{units:[{type:'Height',value:'12',name:''}]}]}},{name:'ONE'}).Height,undefined,'Unitless source measurements never become centimetres');
const sample={kind:'decoration',department:'nx-garland',departmentIds:['nx-garland'],inStock:true,sku:'V52416-01',firstNewObservedAt:'2026-11-16T15:59:00Z',arrivalEvidence:'observed-after-baseline',newStatus:false};
assert.equal(scopeProducts([sample],'nx-garland','today',Date.parse('2026-11-16T15:59:59Z')).length,1);assert.equal(scopeProducts([sample],'nx-garland','today',Date.parse('2026-11-16T16:00:00Z')).length,0);assert.equal(scopeProducts([sample],'nx-garland','new',Date.parse('2026-11-16T16:00:00Z')).length,1);
console.log('PASS: Next exact item/option price and live stock, authoritative native gallery mapping, bundle/plural/tree-accessory/plush classification, source dimension conflicts, unitless measurements and Beijing midnight rollover.');

const factsTree=nextProductFromApi(await read('L85150'),config),factsSpecs=nextSpecs(factsTree,factsTree.options.options[0]),bodyDimensions=nextDimensionFacts(factsTree,factsTree.options.options[0],factsSpecs);
assert.equal(factsSpecs.Height,'210cm');assert.equal(factsSpecs.Diameter,'103cm');assert.equal(factsSpecs.Width,undefined,'Folded raw width cannot become full-tree width');assert.equal(factsSpecs['Source Width'],'24cm');assert.equal(bodyDimensions.dimensions.values.Height,210);
assert.match(nextMaterialFacts({},'172 PVC tips and a mixture of PE needles').label,/聚氯乙烯/);assert.match(nextMaterialFacts({},'172 PVC tips and a mixture of PE needles').label,/聚乙烯/);assert.match(nextMaterialFacts({},'A festive green tree.').label,/Not specified/);
const greenPalette=nextBodyPalette({department:'nx-tree',variantName:'Green Warm White Pre-Lit Christmas Tree',sourceColour:'Green Warm White',sourceDescription:'Warm white LEDs',specifications:{}},{colors:['透明色'],colourConfidence:.1});assert.deepEqual(greenPalette.colors,['绿色']);assert(greenPalette.evidence.lampColourTextExcluded);
const blackPalette=nextBodyPalette({department:'nx-tree',variantName:'Black Multi Light Twig Tree',sourceColour:'Black Multi Light',sourceDescription:'Prelit black branches with multicoloured LED lights',specifications:{}},{colors:['紫色'],colourConfidence:.2});assert.deepEqual(blackPalette.colors,['黑色']);
console.log('PASS: explicit full-tree dimensions replace conflicting folded specifications; documented PE/PVC tips become bilingual materials; warm-white and multicoloured bulbs do not repaint tree branches.');

const{applyNextDisplayFacts}=await import('../server/nx-display-facts.mjs');const documented={retailerId:'nx',sku:'V52421-01',variantName:'Set of 4 Biscuits Felt Christmas Baubles',sourceDescription:'Featuring a selection of your favourite classic biscuits. Set of 4\nFelt material\nIntegrated hanging loops',detailsReady:true,detailEvidence:{verifiedProductSection:true,selectedSku:'V52421-01'},specifications:{Size:'ONE'},material:'材质未确认（Not specified）',observedAt:'2026-11-20T01:00:00Z'};assert(applyNextDisplayFacts(documented));assert.match(documented.material,/毛毡.*Felt/);assert.equal(documented.observedAt,'2026-11-20T01:00:00Z');assert.equal(applyNextDisplayFacts(documented),false);const packageOnly={...documented,sourceDescription:'For use alongside matching felt ornaments, not included.'};applyNextDisplayFacts(packageOnly);assert(!packageOnly.material.includes('Felt'));
const set={...documented,sku:'V52416-01',variantName:'50 Pack Gold Shatterproof Christmas Baubles',detailEvidence:{verifiedProductSection:true,selectedSku:'V52416-01'},sourceDescription:'Set contains:14 x 8cm baubles20 x 3.8cm baubles16 x snowflakes',dimensions:{axes:[],label:'原站尺寸 · ONE'}};assert(applyNextDisplayFacts(set));assert.match(set.dimensions.label,/14 × 8cm.*20 × 3.8cm/);assert.deepEqual(set.dimensions.axes,[]);assert.equal(applyNextDisplayFacts({...set,detailsReady:false}),false);

const threeAxes={Height:'8cm',Width:'4cm',Depth:'4cm'};nextDimensionFacts({title:'Standing glass tree',itemDescription:{toneOfVoice:'Dimensions(mm): Height: 200. Width: 160. Depth: 160.'}},null,threeAxes);assert.deepEqual([threeAxes.Height,threeAxes.Width,threeAxes.Depth],['200mm','160mm','160mm']);assert.equal(threeAxes['Source Width'],'4cm');
const box={Height:'46cm',Width:'30cm',Depth:'32cm'};nextDimensionFacts({title:'Wooden telephone box',itemDescription:{toneOfVoice:'Dimensions: 28cm (Height) x 13cm (Width) x 10.5cm (Length)'}},null,box);assert.equal(box.Depth,undefined);assert.equal(box['Source Depth'],'32cm');assert.equal(box.Length,'10.5cm');

assert.deepEqual(nxPhysicalObject({name:'Lights4fun Multi Autumnal Wreath With Warm White Leds',description:'Berry harvest autumn foliage',groups:['nx-wreath']}),[]);assert.deepEqual(nxPhysicalObject({name:'Christmas Berry Wreath',description:'Christmas greenery',groups:['nx-wreath']}),['nx-wreath']);
console.log('Autumnal LED wreaths stay out of Christmas; lighting never turns an autumn product into a Christmas product.');
