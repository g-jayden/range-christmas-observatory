import assert from 'node:assert/strict';
import sharp from 'sharp';
import {digestNativeOriginal} from '../server/digest-native-original.mjs';
import {createHash} from 'node:crypto';
const bytes=await sharp({create:{width:120,height:180,channels:3,background:'#123456'}}).jpeg().toBuffer(),url='https://www.therange.co.uk/media/1/2/fixture.jpg',sha=createHash('sha256').update(bytes).digest('hex'),p={sku:'123456',originalImageUrl:url,originalImages:[{url,selectedSku:'123456'}],originalImageEvidence:{sourceUrl:url,width:120,height:180}};
let requests=0;const fetcher=async()=>{requests++;return new Response(bytes)};
const got=await digestNativeOriginal(p,{fetcher});assert.equal(got.sha256,sha);assert.deepEqual(got.bytes,bytes);assert.equal(requests,1);
await assert.rejects(digestNativeOriginal({...p,originalImages:[{url,selectedSku:'another'}]},{fetcher}),/mapping/);assert.equal(requests,1);
await assert.rejects(digestNativeOriginal({...p,originalImageEvidence:{sourceUrl:url,width:1200,height:1800}},{fetcher}),/declared/);
const saved=await digestNativeOriginal({...p,originalCachedImageUrl:'images/source/'+sha+'.jpg',originalImageEvidence:{...p.originalImageEvidence,sha256:sha}},{readFile:async()=>bytes,fetcher});assert.deepEqual(saved.bytes,bytes);assert.equal(requests,2,'A verified local original never makes another source request');
await assert.rejects(digestNativeOriginal({...p,originalCachedImageUrl:'images/source/'+sha+'.jpg',originalImageEvidence:{...p.originalImageEvidence,sha256:sha}},{readFile:async()=>Buffer.from('wrong'),fetcher}),/digest/);
console.log('Daily PDF native originals use one exact-SKU source response, preserve its bytes and reject reduced or mismatched source images.');

const missing=Object.assign(new Error('Sparse checkout omits native bytes'),{code:'ENOENT'});let mirrored=0;const fromMirror=await digestNativeOriginal({...p,originalCachedImageUrl:'images/source/'+sha+'.jpg',originalImageEvidence:{...p.originalImageEvidence,sha256:sha}},{readFile:async()=>{throw missing},fetcher:async source=>{mirrored++;assert.equal(source,'https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/images/source/'+sha+'.jpg');return new Response(bytes)}});assert.deepEqual(fromMirror.bytes,bytes);assert.equal(mirrored,1);await assert.rejects(digestNativeOriginal({...p,originalCachedImageUrl:'images/source/'+sha+'.jpg',originalImageEvidence:{...p.originalImageEvidence,sha256:sha}},{readFile:async()=>{throw missing},fetcher:async()=>new Response('wrong bytes')}),/digest/);

for(const retailer of ['asda','du','ms','bm','hb','nx','jl','mt','bq','ar']){const path='images/'+retailer+'/'+sha+'.jpg';const got=await digestNativeOriginal({...p,originalCachedImageUrl:path,originalImageEvidence:{...p.originalImageEvidence,sha256:sha}},{readFile:async()=>{throw missing},fetcher:async url=>{assert.equal(url,'https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/'+path);return new Response(bytes)}});assert.deepEqual(got.bytes,bytes);}
await assert.rejects(digestNativeOriginal({...p,originalCachedImageUrl:'images/unverified/'+sha+'.jpg',originalImageEvidence:{...p.originalImageEvidence,sha256:sha}},{readFile:async()=>{throw missing},fetcher:async()=>{throw Error('Must never fetch an unknown namespace')}}),/Sparse/);
console.log('Sparse PDF jobs retrieve exact hash-bound native originals for all approved retailer namespaces without re-fetching retailer pages.');

for(const failure of ['http404','timeout']){
 const calls=[];const got=await digestNativeOriginal({...p,originalCachedImageUrl:'images/source/'+sha+'.jpg',originalImageEvidence:{...p.originalImageEvidence,sha256:sha}},{readFile:async()=>{throw missing},fetcher:async source=>{calls.push(source);if(source.startsWith('https://raw.githubusercontent.com/')){if(failure==='timeout')throw Error('Repository request timed out');return new Response('',{status:404});}assert.equal(source,url);return new Response(bytes);}});
 assert.equal(calls.length,2);assert.deepEqual(got.bytes,bytes);assert.equal(got.sha256,sha);assert.equal(got.nativeMirrorVerified,false,'A mirror miss must persist its free official recovery');
}
await assert.rejects(digestNativeOriginal({...p,originalImageEvidence:{...p.originalImageEvidence,sha256:'f'.repeat(64)}},{fetcher}),e=>e.code==='NATIVE_SOURCE_VERSION_CHANGED');
console.log('Missing or timed-out repository mirrors still try the free exact official original; changed source pixels require evidence recheck.');
