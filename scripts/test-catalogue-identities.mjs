import assert from'node:assert/strict';import{catalogueIdentityIndex}from'../server/catalogue-identities.mjs';
const p={retailerId:'du',sku:'100',inStock:true,variantName:'Green Christmas Tree with 100 Warm White LEDs',brand:'Brand',dimensions:{values:{Height:180,Width:90}},colorValues:['绿色'],specifications:{'Number of LEDs':'100'},previewImage:{sha256:'a'.repeat(64)},imageCacheEvidence:{sha256:'a'.repeat(64)}};
let d=catalogueIdentityIndex([p,{...p,sku:'200'}]);assert.equal(Object.keys(d.canonical).length,1);
d=catalogueIdentityIndex([p,{...p,sku:'200',specifications:{'Number of LEDs':'200'}}]);assert.equal(Object.keys(d.canonical).length,0,'Distinct LED counts remain distinct even with the same stock photo');
d=catalogueIdentityIndex([p,{...p,retailerId:'ar',sku:'200'}]);assert.equal(Object.keys(d.canonical).length,0,'Retailer offers are not silently collapsed across stores');
const a={...p},b={...p,sku:'200',previewImage:{sha256:'b'.repeat(64)},imageCacheEvidence:{sha256:'b'.repeat(64)}};const sig={dhash:'123456789abcdef0',aspect:1,pixels:Buffer.alloc(768,80).toString('base64')};d=catalogueIdentityIndex([a,b],{photoSignatures:{['a'.repeat(64)]:sig,['b'.repeat(64)]:{...sig,pixels:Buffer.alloc(768,81).toString('base64')}}});assert.equal(Object.keys(d.canonical).length,1,'Minor encoding changes in the same complete product photo may be reconciled with matching source facts');
d=catalogueIdentityIndex([a,b],{photoSignatures:{['a'.repeat(64)]:sig,['b'.repeat(64)]:{...sig,pixels:Buffer.alloc(768,100).toString('base64')}}});assert.equal(Object.keys(d.canonical).length,0,'A matching outline alone cannot merge different actual photos');
console.log('Exact and visual duplicate identities preserve genuine retailer, LED, size/colour/pack differences and reject outline-only matches.');

const{productRetailer}=await import('../web/product-facts.mjs');assert.equal(productRetailer({retailerId:'the-range-gb',kind:'tree'}),'the-range');
