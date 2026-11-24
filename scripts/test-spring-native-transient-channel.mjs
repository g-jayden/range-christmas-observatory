import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
const policy={...JSON.parse(await fs.readFile(new URL('../web/collection-policy.json',import.meta.url))),preferNativePreviewAssets:true,repairImagesOnly:true,imageCheckpoint:'web/native-checkpoint.json'};
const bytes=await sharp({create:{width:120,height:160,channels:3,background:'green'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
const before=process.cwd(),key=process.env.FIRECRAWL_API_KEY;process.env.FIRECRAWL_API_KEY='local-fixture-no-key';
try{for(const mode of ['recover','still-timeout','permanent','deferred-recover','deferred-stuck']){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'spring-transient-channel-'));process.chdir(dir);const calls=[],urls=Array.from({length:10},(_,i)=>'https://www.therange.co.uk/media/temporary-'+i+'.png');
 const success=url=>({url,ok:true,width:120,height:160,mime:'image/png',bytes:bytes.length,hash,dataBase64:bytes.toString('base64')});
 const reader=await createFirecrawlBrowserReader({policy,budget:{limit:16},freeFetcher:async()=>new Response('',{status:403}),freeImageHttp2:async()=>({status:403}),freeImageBrowserRead:async()=>({status:403}),fetcher:async(endpoint,options)=>{
  const script=JSON.parse(options.body).actions[0].script,m=script.match(/\)\((\[[\s\S]*\]),(\{"concurrency":\d+\})\)$/);assert(m,'The original-byte batch carries its explicit concurrency');const items=JSON.parse(m[1]),settings=JSON.parse(m[2]);calls.push({urls:items.map(i=>i.url),concurrency:settings.concurrency});
  if(calls.length===2&&!mode.startsWith('deferred-')){const checkpoint=JSON.parse(await fs.readFile(policy.imageCheckpoint));assert(checkpoint.entries[urls[0]],'Save the earlier successful original before a transient retry');assert.deepEqual(await fs.readFile('web/images/source/'+hash+'.png'),bytes);}
  const rows=items.map((item,i)=>mode.startsWith('deferred-')?(calls.length===1||mode==='deferred-stuck'?{url:item.url,ok:false,deferred:true,error:'bounded image time limit'}:success(item.url)):mode==='permanent'?{url:item.url,ok:false,status:403,error:'access-blocked'}:calls.length===1?(i===0?success(item.url):{url:item.url,ok:false,error:'image-fetch-or-decode-failed: signal timed out'}):mode==='recover'?success(item.url):{url:item.url,ok:false,error:'image-fetch-or-decode-failed: signal timed out'});
  return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:rows}]}}});
 }});
 try{if(mode==='recover'||mode==='deferred-recover'){const audit=await reader.auditImages(urls.map(variantImageUrl=>({variantImageUrl})),{},{bodyBatchSize:80});assert.equal(audit.loaded,10);assert.equal(audit.failed,0);assert.deepEqual(calls.map(c=>c.concurrency),[8,2]);assert.deepEqual(calls[1].urls,mode==='recover'?urls.slice(1):urls);}else{await assert.rejects(()=>reader.auditImages(urls.map(variantImageUrl=>({variantImageUrl})),{},{bodyBatchSize:80}),/图片主通道/);assert.equal(calls.length,mode==='permanent'?1:2);const checkpoint=JSON.parse(await fs.readFile(policy.imageCheckpoint));if(mode==='still-timeout'){assert(checkpoint.entries[urls[0]]);assert.deepEqual(await fs.readFile('web/images/source/'+hash+'.png'),bytes);}if(mode==='deferred-stuck')assert.equal(Object.keys(checkpoint.entries).length,0);}await reader.close();assert.equal(reader.metrics().firecrawlCredits,calls.length);
 }finally{await reader.close();process.chdir(before);await fs.rm(dir,{recursive:true,force:true});}
 }}finally{process.chdir(before);if(key===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=key;}
console.log('PASS: transient first-batch timeouts retry only failed URLs once at lower concurrency; recovered originals are exact, persistent failures stop, permanent 403 is not retried, and all earlier successful native bytes and billing receipts survive.');
