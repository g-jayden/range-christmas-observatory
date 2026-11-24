import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {productNames,PDF_LAYOUT_VERSION} from '../web/product-names.mjs';
import {offeredObject} from '../web/taxonomy.mjs';
const villageModel = {variantName:'The Tipsy Tavern Model',kind:'decoration',department:'ornaments',sourceDescription:'A miniature festive pub building with warm lights.'};
assert.equal(offeredObject(villageModel).id,'scenes');
assert(productNames(villageModel).zh.includes('微醺酒馆'));
assert(productNames(villageModel).zh.includes('建筑模型'));
assert(productNames({variantName:'Deers with Sleigh Decoration - Golden',department:'ornaments'}).zh.includes('鹿与雪橇'));
assert.equal(offeredObject({variantName:'Deers with Sleigh Decoration - Golden',kind:'decoration',dimensions:{values:{Height:57.8,Width:17.8,Depth:90.5}}}).id,'standing');
assert.equal(offeredObject({variantName:'Deer Hanging Tree Ornament',kind:'decoration',dimensions:{values:{Height:8}}}).id,'tree-decorations');
assert.notEqual(offeredObject({variantName:'Tavern Hanging Tree Ornament',kind:'decoration',department:'tree-decorations',dimensions:{values:{Height:8}}}).id,'scenes');
import {cataloguePdf} from '../web/catalogue-pdf.mjs';
import {reportPages,reportCells,REPORT_PAGE} from '../web/report-layout.mjs';
import {productPrice,productSize} from '../web/product-facts.mjs';
import {createFavoritesReportController} from '../web/favorites-report.mjs';

const tree={retailerId:'the-range',sku:'515142',department:'tree',variantName:'7ft Pre-Lit Opulent Artificial Fir Tree',priceGBP:199.99,heightLabel:'7ft'};
assert.deepEqual(productNames(tree),{en:tree.variantName,zh:'7英尺预装灯人造华丽冷杉圣诞树'});
assert.match(productNames({department:'nx-baubles',variantName:'50 Pack Berry Metallic Shatterproof Baubles'}).zh,/防碎.*浆果.*装饰球.*50件套/);
assert.match(productNames({department:'nx-baubles',variantName:'50 Pack Monochrome Spot Shatterproof Christmas Baubles'}).zh,/黑白色波点.*圣诞装饰球.*50件套/);
assert.match(productNames({department:'nx-baubles',variantName:'Set of 4 Biscuits Felt Christmas Baubles'}).zh,/毛毡饼干造型.*4件套/);
assert.match(productNames({department:'nx-baubles',variantName:'Set of 4 Bakery Felt Christmas Baubles'}).zh,/毛毡烘焙点心造型.*4件套/);
assert.match(productNames({department:'nx-baubles',variantName:'Personalised Dog Breed Christmas Bauble by PMC'}).zh,/定制犬种图案/);
assert.match(productNames({department:'tree-decorations',variantName:'LED Gingerbread House Hanging Decoration'}).zh,/姜饼屋LED圣诞挂饰/);
assert(!productNames({...tree,variantName:'7ft Non-Flocked Artificial Tree'}).zh.includes('覆雪'));
assert.match(productNames({department:'wreath',variantName:'Set of LED Wreath and Garland'}).zh,/圣诞圈与长藤套装/);
assert.equal(productNames({department:'lights',variantName:'LED Christmas Fairground Model'}).zh,'LED圣诞游乐场模型','A named physical model must not be reduced to its lighting department in the Chinese product name');
assert.equal(productNames({department:'asda-tree-decorations',variantName:'Scottish Everlastings 10cm Rose Clip 6pc Set'}).zh,'10厘米玫瑰花夹（6件套）');
assert.match(productNames({department:'nx-wreath',variantName:'Gold Light Up Christmas Bauble Wreath'}).zh,/圣诞圈$/);
assert.match(productNames({department:'jl-garland',variantName:'John Lewis Chinese Lantern Garland, L183cm'}).zh,/灯笼造型圣诞长藤$/);
assert.match(productNames({department:'nx-baubles',variantName:'Decoris Assorted Pearl Look Christmas Tree Bow Decoration'}).zh,/仿珍珠光泽.*蝴蝶结圣诞树装饰$/);
assert.match(productNames({department:'jl-topper',variantName:'Georg Jensen Lyra Star Christmas Tree Top Decoration, Gold'}).zh,/圣诞树顶装饰$/);
assert.match(productNames({department:'garland',variantName:'9ft Christmas Garland Decorations Fireplace Artificial Wreath Bushy Pine 220Tips - Green'}).zh,/绿色松枝圣诞长藤/);
const light=productNames({department:'lights',variantName:'300 Warm White LED Lights'}).zh;assert(light.includes('暖白光'));assert(!light.includes('白色'),'Warm white describes the emitted light, not a claimed body colour');
const pineConeLight=productNames({department:'lights',variantName:'LED Multi action Pine Cone Christmas Lights - Warm White'}).zh;assert(pineConeLight.includes('松果'));assert(pineConeLight.includes('多模式'));assert(pineConeLight.includes('暖白光'));assert(!pineConeLight.includes('松枝'));assert(!pineConeLight.includes('多彩'),'Multi action describes lighting modes, not multiple colours');
const reviewed={...tree,localizedProductName:{sourceName:tree.variantName,zh:'华丽冷杉圣诞树'}};assert.equal(productNames(reviewed).zh,'华丽冷杉圣诞树');assert.notEqual(productNames({...reviewed,variantName:'Pink Tinsel Tree'}).zh,'华丽冷杉圣诞树','A translation cannot outlive its exact official source title');
for(const retailerId of ['the-range','asda','ms','bm','hb','du','nx','jl','mt','bq','ar']){const names=productNames({...tree,retailerId});assert.equal(names.en,tree.variantName);assert(names.zh.includes('圣诞树'));}

// One PDF engine serves browser favorites and server daily digests. Names
// augment, rather than replace, exact price/size data and native image bytes.
const rows=Array.from({length:9},(_,i)=>({...tree,sku:String(i),variantName:i===0?tree.variantName:'Artificial Christmas Tree '+i}));rows.push({...tree,retailerId:'jl',sku:'other-store',department:'jl-tree'});
const pages=reportPages(rows);assert.deepEqual(pages.map(p=>p.products.length),[8,1,1]);assert.equal(pages[2].retailer,'jl');
const native=Uint8Array.from([255,216,12,34,56,78,255,217]),captions=[],adapter=async()=>({width:1800,height:2400,bytes:native,filter:'DCTDecode'});
const chunks=await cataloguePdf(rows,{parts:true,image:adapter,text:async value=>{captions.push(value);return {width:1200,height:320,bytes:new Uint8Array([1,2,3]),filter:'FlateDecode'};}});
assert(captions.includes(productNames(tree).zh+'\n'+tree.variantName+'\n'+productPrice(tree)+'\n'+productSize(tree)));
assert.equal(chunks.filter(b=>b===native).length,10,'Every product retains its untouched native JPEG stream');
const cells=reportCells();assert.equal(cells.length,8);assert(cells.every(c=>c.imageHeight>100&&c.top+c.height<=REPORT_PAGE.height-REPORT_PAGE.margin+.01));

// Existing PDFs are cached in IndexedDB. Reject a pre-name cache and rebuild
// when either the title or its source-bound Chinese translation changes.
const scheduled=[],keys=[],states=[];let builds=0;
const controller=createFavoritesReportController({cache:{get:async key=>{keys.push(key);return key.startsWith('[["')?new Blob(['old']):null;},set:async()=>{},remove:async()=>{}},build:async()=>{builds++;return [new Uint8Array([1])];},urls:{createObjectURL:()=> 'blob:report',revokeObjectURL:()=>{}},schedule:f=>(scheduled.push(f),f),cancel:()=>{}});
for(const item of [tree,{...tree,variantName:'8ft Pre-Lit Opulent Artificial Fir Tree'},reviewed]){controller.prepare([item],s=>states.push(s));await scheduled.shift()();}
assert.equal(builds,3);assert.equal(new Set(keys).size,3);assert(keys.every(k=>JSON.parse(k)[0]===PDF_LAYOUT_VERSION));assert(states.at(-1).ready);
const {STATIC_FRONTEND_ENTRIES}=await import('../server/static-front-end-assets.mjs');assert(STATIC_FRONTEND_ENTRIES.includes('product-names.mjs'));
const daily=await fs.readFile('scripts/prepare-daily-digests.mjs','utf8');assert(daily.includes('names:productNames(p)'));assert(daily.includes('layoutVersion:PDF_LAYOUT_VERSION'));
console.log('Bilingual names: exact official English, source-bound Chinese, unchanged source price/size, eight native photos per page, favorites cache migration and both report entry points passed.');
