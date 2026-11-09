import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {normaliseAsdaProduct,asdaFingerprint} from '../server/asda-products.mjs';
import {asdaMemberships,ASDA_DEPARTMENTS,retailerProductKey} from '../web/asda-model.mjs';
import {parseAsdaPage,asdaPageParserSource,asdaBatchScript} from '../server/asda-source.mjs';
import {isToday,isNew} from '../web/catalogue-model.mjs';
const {listing,detail}=JSON.parse(await fs.readFile('test/fixtures/asda-product.json','utf8')),at='2026-11-09T22:50:00Z';
const p=normaliseAsdaProduct(listing,detail,{observedAt:at,baseline:true});
assert.equal(p.sku,'060186698');assert.equal(p.department,'asda-tree');assert.equal(p.priceGBP,40);assert.deepEqual(p.colorValues,['金色']);assert.match(p.material,/Metal|金属/);assert.equal(p.dimensions.values.Height,193);assert.equal(p.originalImages[0].height,1800);assert.equal(p.originalImages[0].selectedSku,p.sku);assert.equal(isToday(p,at),false);
const cached=normaliseAsdaProduct(listing,null,{observedAt:'2026-11-10T22:50:00Z',previous:p});assert.equal(cached.detailsReady,true);assert.equal(cached.attributeObservedAt,at);assert.equal(cached.originalImageUrl,p.originalImageUrl);assert.equal(asdaFingerprint(cached),asdaFingerprint(p));
assert.equal(ASDA_DEPARTMENTS.length,7);assert.notEqual(retailerProductKey(p),retailerProductKey({...p,retailerId:'the-range'}));
for(const [variantName,cat,expected]of [['Wreath Shaped Hanging Decoration','D18M2G1C9','asda-tree-decorations'],['Christmas Wreath Hanger','D18M2G1C9','asda-room'],['Christmas Bauble Garland','D18M2G1C9','asda-garland'],['Brush Christmas Trees Set of 5','D18M2G1C6','asda-room'],['LED Christmas House','D18M2G1C6','asda-room']])assert.equal(asdaMemberships({variantName,asdaSource:{primaryCategoryID:cat}}).primary,expected);
assert.deepEqual(asdaMemberships({variantName:'Indoor Christmas Lights',specifications:{'Indoor / Outdoor':'Indoor Only'}}).memberships,['asda-lights']);assert.ok(asdaMemberships({variantName:'Outdoor Lit Reindeer',specifications:{'Indoor / Outdoor':'Indoor & Outdoor'}}).memberships.includes('asda-outdoor'));
const arrival=normaliseAsdaProduct(listing,detail,{observedAt:at,baseline:false});assert.equal(isToday(arrival,'2026-11-09T23:30:00Z'),true);assert.equal(isToday(arrival,'2026-11-10T16:00:00Z'),false);assert.equal(isNew(arrival),true);
const html='<script>window.productData = '+JSON.stringify({data:{product:detail}})+'</script>';assert.equal(parseAsdaPage(html).product.id,p.sku);assert.equal(vm.runInNewContext(asdaPageParserSource())(html).product.id,p.sku);
assert.throws(()=>normaliseAsdaProduct(listing,{...detail,id:'60186698'},{observedAt:at}));assert.throws(()=>normaliseAsdaProduct({...listing,URL:'https://example.com/'+listing.id},null,{observedAt:at}));
console.log('ASDA native source, exact SKU, prices, categories, cache and midnight tests passed');

const masterListing={...listing,id:'GEM859829',productType:'master',name:'Christmas String Lights - Various Lengths',URL:listing.URL.replaceAll('060186698','GEM859829'),price:{type:'range',min:{list:{value:7}}}};const master=normaliseAsdaProduct(masterListing,null,{observedAt:at,baseline:true});assert.equal(master.recordType,'product-family');assert.equal(master.priceFrom,true);assert.equal(master.priceGBP,7);const masterHtml='<script>window.searchJSON = '+JSON.stringify({productSearch:{products:[masterListing],productsBase64Images:{}}})+'; window.dwProducts={"GEM859829":{productData: '+JSON.stringify(masterListing)+'}};</script>';assert.equal(parseAsdaPage(masterHtml).enriched[0].id,'GEM859829');

assert.equal(normaliseAsdaProduct({...listing,productSetProduct:true},detail,{observedAt:at,baseline:true}).recordType,'sku','A sellable member of a product set is still one exact SKU');

const externalCategoryURL='https://direct.asda.com/george/toys-character/soft-toys/christmas-plush/060186698,default,pd.html';const externalResult=await vm.runInNewContext(asdaBatchScript([{sku:listing.id,url:externalCategoryURL}]),{fetch:async()=>({ok:true,status:200,text:async()=>html}),URL,AbortSignal,Date,JSON,Promise});assert.equal(externalResult[0].status,200,'A Christmas catalogue item can have its official PDP under a different George department');
