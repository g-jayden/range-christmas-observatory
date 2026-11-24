import assert from 'node:assert/strict';
import {chooseBqPreview} from '../server/bq-preview.mjs';
import {bqImageKey} from '../server/bq-images.mjs';

const asset='https://media.diy.com/is/image/Kingfisher/exact-version-test',key=bqImageKey(asset),hash='a'.repeat(64);
const product={sku:'1234567890123',variantId:'1234567890123',baseName:'Green Christmas Garland',sourceDescription:'Green pine foliage garland',sourceColour:'Green',department:'bq-garland',observedAt:new Date(Date.now()-3600000).toISOString(),specifications:{},originalImages:[{url:asset}]};
const saved={asset,width:1500,height:1000,sourceVersion:'native-v2',sha256:hash,checkedAt:new Date(Date.now()-86400000).toISOString()};
const analysis={imageHash:hash,colors:['绿色'],colourConfidence:.99,objectTop:[{id:'bq-garland',score:.95}],quality:{scores:{whole:.99,detail:0,logo:0,diagram:0,room:0},geometry:{white:.6,edge:.001,touchedSides:0}},ocr:{text:'',confidence:99}};
const priorFetch=globalThis.fetch;
try{
 const calls=[],index={[key]:{...saved}},visual={[key]:structuredClone(analysis)},selections={};
 globalThis.fetch=async raw=>{const u=new URL(raw);calls.push(u.href);assert.equal(u.search,'?req=props,json','An unchanged, already analysed original needs only the current official version');return Response.json({'image.width':'1500','image.height':'1000','image.version':'native-v2'});};
 await chooseBqPreview(product,{index,visual,selections});
 assert.equal(calls.length,1);assert.equal(index[key].sha256,hash);assert.equal(index[key].previewBytesObservedAt,saved.checkedAt);assert(Date.parse(index[key].sourceVersionCheckedAt)>=Date.parse(product.observedAt));assert.equal(selections[product.sku].imageHash,hash);assert.equal(visual[key].ocr.text,'');
 const changedCalls=[],changedIndex={[key]:{...saved}},changedVisual={[key]:structuredClone(analysis)};
 globalThis.fetch=async raw=>{const u=new URL(raw);changedCalls.push(u.href);if(u.search==='?req=props,json')return Response.json({'image.width':'1500','image.height':'1000','image.version':'native-v3'});return new Response('refused new pixels',{status:403});};
 const changedSelections={};await chooseBqPreview(product,{index:changedIndex,visual:changedVisual,selections:changedSelections});assert.equal(changedCalls.length,2,'Changed native versions require actual new pixels');assert.equal(changedSelections[product.sku],undefined,'Old pixels cannot certify a changed source image');assert.match(changedIndex[key].error,/403/);
}finally{globalThis.fetch=priorFetch;}
console.log('PASS: gallery alternatives reuse matching current official version and exact prior pixels/OCR; changed versions require new bytes and cannot become false approvals.');
