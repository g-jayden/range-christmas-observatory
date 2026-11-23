import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {execFileSync} from 'node:child_process';
const policy={...JSON.parse(await fs.readFile(new URL('../web/collection-policy.json',import.meta.url))),preferNativePreviewAssets:true,repairImagesOnly:true,imageCheckpoint:'web/native-preview-checkpoint.json'};
const cwd=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'spring-native-preview-')),key=process.env.FIRECRAWL_API_KEY;
const url='https://www.therange.co.uk/media/exact-native-gallery.png',bytes=await sharp({create:{width:1200,height:1600,channels:3,background:'#239b56'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
process.env.FIRECRAWL_API_KEY='fixture-not-a-real-key';
try{
 process.chdir(dir);let paid=0;const ladder=[];
 const reader=await createFirecrawlBrowserReader({policy,budget:{limit:16},freeFetcher:async()=>{ladder.push('http');return new Response('',{status:403});},freeImageHttp2:async()=>{ladder.push('http2');return{status:403};},freeImageBrowserRead:async()=>{ladder.push('browser');return{status:403};},fetcher:async(endpoint,options)=>{paid++;ladder.push('paid');const action=JSON.parse(options.body).actions[0].script;assert(action.includes('readImageBatch'),'Spring reuses the verified original-byte transport');assert(!action.includes('canvas.toBlob'),'Remote canvas encoding is not required');return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:[{url,ok:true,width:1200,height:1600,mime:'image/png',hash,dataBase64:bytes.toString('base64'),bytes:bytes.length}]}]}}});}});
 const [small]=await reader.previewAssets([url],{maxSide:320}),[large]=await reader.previewAssets([url],{maxSide:600});
 assert.equal(small.sourceHash,hash);assert.equal(small.height,320);assert.equal(large.height,600);assert.equal(large.sourceHeight,1600);assert.equal(paid,1);assert.deepEqual(ladder,['http','http2','browser','paid']);assert.deepEqual(await fs.readFile('web/images/source/'+hash+'.png'),bytes,'The original bytes remain available for PDF and full-image saving');await reader.close();assert.equal(reader.metrics().firecrawlCredits,1);
 const next=await createFirecrawlBrowserReader({policy,budget:{limit:16},freeFetcher:async()=>new Response('',{status:403}),freeImageHttp2:async()=>({status:403}),freeImageBrowserRead:async()=>({status:403}),fetcher:async()=>assert.fail('Saved native checkpoint must prevent repeat paid retrieval')});
 assert.equal((await next.previewAssets([url]))[0].sourceHash,hash);await next.close();assert.equal(next.metrics().firecrawlCredits,0);
}finally{process.chdir(cwd);if(key===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=key;await fs.rm(dir,{recursive:true,force:true});}
console.log('PASS: Spring previews reuse verified native bytes, try free methods first, retain full originals and render subsequent sizes without repeated paid retrieval.');
const second=await fs.mkdtemp(path.join(os.tmpdir(),'spring-preview-after-checkpoint-')),beforeKey=process.env.FIRECRAWL_API_KEY;
try{
 process.chdir(second);process.env.FIRECRAWL_API_KEY='fixture-not-a-real-key';const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});git(['init','-q']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
 const other=await sharp({create:{width:100,height:120,channels:3,background:'blue'}}).png().toBuffer(),otherHash=createHash('sha256').update(other).digest('hex'),urls=Array.from({length:81},(_,i)=>'https://www.therange.co.uk/media/after-checkpoint-'+i+'.png');let batches=0;
 const reader=await createFirecrawlBrowserReader({policy,budget:{limit:16},freeFetcher:async()=>new Response('',{status:403}),freeImageHttp2:async()=>({status:403}),freeImageBrowserRead:async()=>({status:403}),fetcher:async()=>{batches++;if(batches===2){git(['add','web']);git(['commit','-qm','Saved exact native checkpoint']);await fs.unlink('web/images/source/'+hash+'.png');}const current=batches===1?urls.slice(0,80):urls.slice(80),data=batches===1?bytes:other,h=batches===1?hash:otherHash;return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:current.map(url=>({url,ok:true,width:batches===1?1200:100,height:batches===1?1600:120,mime:'image/png',hash:h,dataBase64:data.toString('base64'),bytes:data.length}))}]}}});}});
 const previews=await reader.previewAssets(urls,{maxSide:320});assert.equal(previews.length,81);assert(previews.every(r=>r.ok));assert.equal(previews[0].sourceHash,hash);assert.equal(previews[80].sourceHash,otherHash);assert.equal(batches,2,'Restoring a frame removed by the later checkpoint makes no third paid request');assert.deepEqual(await fs.readFile('web/images/source/'+hash+'.png'),bytes);await reader.close();
}finally{process.chdir(cwd);if(beforeKey===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=beforeKey;await fs.rm(second,{recursive:true,force:true});}
console.log('PASS: all 81 previews survive a checkpoint between native batches, using the exact earlier committed pixels without repeated collection.');
