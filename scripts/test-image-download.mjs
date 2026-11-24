import assert from 'node:assert/strict';
import {downloadNativeImage} from '../web/image-download.mjs';
await import('./test-public-image-cache.mjs');
{
 const owned='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/images/source/'+'a'.repeat(64)+'.jpg',started=Date.now();
 const result=await downloadNativeImage(owned,{timeoutMs:1000,proxyForUrl:async()=> 'https://owner.example.invalid/cached-native',fetcher:async(url,{signal})=>url.includes('/cached-native')?new Response('original',{headers:{'content-type':'image/jpeg'}}):new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
 assert.equal(await result.text(),'original');assert(Date.now()-started<300,'The SHA-bound owner cache starts immediately instead of waiting the retailer-CDN hedge delay');
}
const source='https://www.therange.co.uk/media/a.jpg',proxy='https://owner.example.invalid/public/image',photo=()=>new Response('native original bytes',{headers:{'content-type':'image/jpeg'}});let calls=[];
let blob=await downloadNativeImage(source,{fetcher:async url=>{calls.push(url);return photo();},proxyForUrl:async()=>proxy,hedgeDelayMs:10});assert.equal(await blob.text(),'native original bytes');assert.deepEqual(calls,[source],'A fast native source never starts a redundant proxy request');
calls=[];let aborted=false;blob=await downloadNativeImage(source,{hedgeDelayMs:1,timeoutMs:1000,proxyForUrl:async()=>proxy,fetcher:async(url,{signal,credentials})=>{assert.equal(credentials,'omit');calls.push(url);if(url===proxy)return photo();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true}));}});assert.equal(await blob.text(),'native original bytes');assert(aborted);assert.deepEqual(calls,[source,proxy]);
await assert.rejects(downloadNativeImage(source,{fetcher:async()=>new Response('blocked',{status:403}),proxyForUrl:async()=>proxy,hedgeDelayMs:1}),/403/);console.log('Fast original responses avoid duplicate traffic; blocked direct images use the cached owner proxy promptly and losing transfers are cancelled.');
