import assert from'node:assert/strict';import{catalogueIdentityIndex}from'../server/catalogue-identities.mjs';
await import('./test-range-gallery-identity-index.mjs');
const p={originalImages:[{url:'https://official.example.invalid/shared-full-product.jpg'}],retailerId:'du',sku:'100',inStock:true,variantName:'Green Christmas Tree with 100 Warm White LEDs',brand:'Brand',dimensions:{values:{Height:180,Width:90}},colorValues:['绿色'],specifications:{'Number of LEDs':'100'},previewImage:{sha256:'a'.repeat(64)},imageCacheEvidence:{sha256:'a'.repeat(64)}};
let d=catalogueIdentityIndex([p,{...p,sku:'200'}]);assert.equal(Object.keys(d.canonical).length,1);
d=catalogueIdentityIndex([p,{...p,sku:'200',specifications:{'Number of LEDs':'200'}}]);assert.equal(Object.keys(d.canonical).length,0,'Distinct LED counts remain distinct even with the same stock photo');
d=catalogueIdentityIndex([p,{...p,retailerId:'ar',sku:'200'}]);assert.equal(Object.keys(d.canonical).length,0,'Retailer offers are not silently collapsed across stores');
const a={...p},b={...p,sku:'200',previewImage:{sha256:'b'.repeat(64)},imageCacheEvidence:{sha256:'b'.repeat(64)}};const sig={dhash:'123456789abcdef0',aspect:1,pixels:Buffer.alloc(768,80).toString('base64')};d=catalogueIdentityIndex([a,b],{photoSignatures:{['a'.repeat(64)]:sig,['b'.repeat(64)]:{...sig,pixels:Buffer.alloc(768,81).toString('base64')}}});assert.equal(Object.keys(d.canonical).length,1,'Minor encoding changes in the same complete product photo may be reconciled with matching source facts');
d=catalogueIdentityIndex([a,b],{photoSignatures:{['a'.repeat(64)]:sig,['b'.repeat(64)]:{...sig,pixels:Buffer.alloc(768,100).toString('base64')}}});assert.equal(Object.keys(d.canonical).length,0,'A matching outline alone cannot merge different actual photos');
console.log('Exact and visual duplicate identities preserve genuine retailer, LED, size/colour/pack differences and reject outline-only matches.');

const{productRetailer}=await import('../web/product-facts.mjs');assert.equal(productRetailer({retailerId:'the-range-gb',kind:'tree'}),'the-range');

// These are real shared-photo variant failures observed in the catalogue.
for(const names of [['1 x 200ml Artificial Xmas Tree Snow Spray','2 x 200ml Artificial Xmas Tree Snow Spray'],['St Helens RGB Letter N','St Helens RGB Letter A'],['RGB LIGHT S STRAWBERRY','RGB LIGHT M STRAWBERRY'],['Shatterproof Baubles - Gold / 10cm / 3','Shatterproof Baubles - Gold / 10cm / 6'],['Christmas Tinsel - Red & White','Christmas Tinsel - Red']]){d=catalogueIdentityIndex([{...p,variantName:names[0]},{...p,sku:'200',variantName:names[1]}]);assert.equal(Object.keys(d.canonical).length,0,names.join(' versus '));}
d=catalogueIdentityIndex([{...p,variantName:'Pre Lit Christmas Tree Green'},{...p,sku:'200',variantName:'Green Christmas Tree Pre Lit'}]);assert.equal(Object.keys(d.canonical).length,1,'Identical full offered titles may vary only in word order');
console.log('Full offered titles preserve single letters, quantity suffixes, colour variants and one-digit packs even when all source photos and coarse measurements match.');
const otherGallery={...p,sku:'200',originalImages:[...p.originalImages,{url:'https://official.example.invalid/different-printed-panels.jpg'}]};
assert.equal(Object.keys(catalogueIdentityIndex([p,otherGallery]).canonical).length,0,'Shared hero photos and titles cannot hide a different offered gallery or printed design');
const differentUrls={...p,sku:'200',originalImages:[{url:'https://official.example.invalid/second-seller-product.jpg'}]};
assert.equal(Object.keys(catalogueIdentityIndex([p,differentUrls]).canonical).length,0,'Unverified different gallery assets cannot be silently merged');
assert.equal(Object.keys(catalogueIdentityIndex([p,differentUrls],{galleryHashes:{[p.originalImages[0].url]:'c'.repeat(64),[differentUrls.originalImages[0].url]:'c'.repeat(64)}}).canonical).length,1,'Complete byte-identical official galleries can reconcile different supplier asset URLs');
assert.equal(Object.keys(catalogueIdentityIndex([{...p,originalImages:[]},{...p,sku:'200',originalImages:[]}]).canonical).length,0,'A missing complete gallery cannot prove the same offered product');
console.log('Complete-gallery comparison preserves different kit designs even when shared hero photos, offered titles and dimensions agree.');
for(const changed of [{specifications:{...p.specifications,'Pack quantity':'2'}},{material:'Metal'},{bqSource:{choices:[{key:'Design',value:'Robin'}]}}])assert.equal(Object.keys(catalogueIdentityIndex([p,{...p,...changed,sku:'200'}]).canonical).length,0,'Exact pack, material and chosen design differences remain distinct despite identical source galleries');
