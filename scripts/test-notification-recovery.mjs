import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Control} from '../cloud/worker.mjs';
import {finishNewEvents,checkNew,deliverVerifiedEvents,captureNewScreenshots,retainVerifiedNewImages} from '../server/new-events.mjs';
class Store{
 constructor(){this.m=new Map}
 async get(k){return structuredClone(this.m.get(k))}
 async put(k,v){if(typeof k==='object')for(const[a,b]of Object.entries(k))this.m.set(a,structuredClone(b));else this.m.set(k,structuredClone(v))}
 async delete(k){return this.m.delete(k)}
 async list({prefix}){return new Map([...this.m].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))}
 async transaction(fn){return fn(this)}
}
const db=new Store,app=new Control({storage:db},{CONTROL_TOKEN:'control',ADMIN_TOKEN:'admin',BREVO_API_KEY:'test',MAIL_FROM:'sender@example.com'});
const cwd=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'range-delivery-recovery-')),original=globalThis.fetch,oldActions=process.env.GITHUB_ACTIONS;
let published=false,sent=0,invocationFetches=0,limitInvocationFetches=false;
async function request(route,body,secret='control'){
 return app.fetch(new Request('https://worker.example'+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));
}
async function controlCall(route,body){const r=await request(route,body),d=await r.json();if(!r.ok)throw Error(d.error);return d;}
try{
 process.chdir(dir);process.env.GITHUB_ACTIONS='true';
 globalThis.fetch=async(url,opts)=>{
  invocationFetches++;if(limitInvocationFetches)assert(invocationFetches<=45,'A native-attachment delivery must fit the free Worker subrequest budget');
  if(opts.method==='HEAD')return new Response(null,{status:published?200:404,headers:{'content-type':'image/png'}});
  assert.equal(url,'https://api.brevo.com/v3/smtp/email');const mail=JSON.parse(opts.body);assert.equal(mail.attachment.length,3);sent++;return Response.json({messageId:'receipt-'+sent},{status:201});
 };
 await db.put('sub/reader',{email:'reader@example.com',scopes:['skirt'],confirmedAt:new Date(Date.now()-60000).toISOString()});
 await controlCall('/internal/seed',{records:[]});const claim=await controlCall('/internal/claim',{forceMonitor:true});
 const prefix='https://g-jayden.github.io/range-christmas-observatory/mail-assets/523225/';
 const p={sku:'523225',sourceUrl:'https://www.therange.co.uk/p/skirt/#523225',kind:'skirt',newStatus:true,variantName:'Brown skirt',priceGBP:9.99,detailEvidence:{selectedSku:'523225',verifiedProductSection:true},mailAssets:{card:{url:prefix+'card.png'},original:{url:prefix+'original.jpg'},proof:{url:prefix+'proof.png'}}};
 await controlCall('/internal/monitor-plan',{lease:claim.lease,products:[p]});
 const result={success:true,scanned:1,captured:1,events:[{product:p,lease:claim.lease,screenshotBase64:Buffer.from('real-page-test-fixture').toString('base64')}]};
 const staged=await finishNewEvents(result,{snapshot:{products:[p]},lease:claim.lease,controlCall});
 assert.equal(staged.deliveryPending,true);assert.equal((await db.list({prefix:'event/'})).size,1);assert.equal((await db.list({prefix:'pending/'})).size,0);assert.equal((await app.deliveryStatus()).pendingDeliveries,1);assert.equal((await app.monitorState()).state,'delivery-pending');assert.equal(sent,0);
 // Simulate Pages failure and destruction of the entire runner's temporary outbox.
 await fs.rm('runtime',{recursive:true});assert.equal((await request('/internal/deliver',{})).status,503);assert.equal(sent,0);assert.equal((await app.deliveryStatus()).pendingDeliveries,1);
 published=true;const delivered=await controlCall('/internal/deliver',{});assert.equal(delivered.accepted,1);assert.equal(delivered.pendingDeliveries,0);assert.equal((await app.monitorState()).state,'active');
 assert.equal((await controlCall('/internal/deliver',{})).accepted,0);assert.equal(sent,1,'Recovered mail is delivered only once without a source reader');
 const legacy=await app.monitorState();await db.put('monitor',{...legacy,state:'not-started',nextRunAt:'2026-01-01T23:00:00Z'});await controlCall('/internal/deliver',{});assert.equal((await app.monitorState()).state,'active');assert(Date.parse((await app.monitorState()).nextRunAt)>Date.now());
 const missing={...p,sku:'523226',detailEvidence:{selectedSku:'523226',verifiedProductSection:true}};
 assert.equal((await request('/admin/recover-event',{product:missing,screenshotBase64:'aW1hZ2U='},'admin')).status,409,'Recovery cannot inject unobserved NEW products');
 const pending={...p,sku:'523227',sourceUrl:'https://www.therange.co.uk/p/skirt/#523227',detailEvidence:{selectedSku:'523227',verifiedProductSection:true},mailAssets:{card:{url:prefix.replace('523225','523227')+'card.png'},original:{url:prefix.replace('523225','523227')+'original.jpg'},proof:{url:prefix.replace('523225','523227')+'proof.png'}}};
 await db.put('pending/523227',{...pending,firstDetectedAt:new Date().toISOString()});
 assert.equal((await request('/admin/recover-event',{product:pending,screenshotBase64:'aW1hZ2U='},'admin')).status,200,'Owner can recover a real observed product after its old lease expired');
 assert.equal((await request('/admin/recover-event',{},'wrong')).status,401);
 const batchDb=new Store,batchApp=new Control({storage:batchDb},{CONTROL_TOKEN:'batch-control',BREVO_API_KEY:'test',MAIL_FROM:'sender@example.com'}),sizes=[];
 const observed=Array.from({length:1205},(_,i)=>({sku:String(600000+i),sourceUrl:'https://www.therange.co.uk/p/test/#'+(600000+i),newStatus:true,kind:'decoration',department:'wreath',departmentIds:['wreath','outdoor']}));
 const batchControl=async(route,body)=>{if(route==='/internal/monitor-plan'){sizes.push(body.products.length);assert(body.products.every(p=>p.newStatus&&p.departmentIds.includes('wreath')))}const r=await batchApp.fetch(new Request('https://worker.example'+route,{method:'POST',headers:{authorization:'Bearer batch-control','content-type':'application/json'},body:JSON.stringify(body)}));assert.equal(r.status,200);return r.json()};
 await batchControl('/internal/seed',{records:observed.map(p=>({sku:p.sku,everNew:true}))});const batchClaim=await batchControl('/internal/claim',{forceMonitor:true});
 const many=[...observed,...Array.from({length:10000},(_,i)=>({sku:String(700000+i),newStatus:false}))];
 const batched=await checkNew({snapshot:{products:many},reader:{raw:()=>{throw Error('Unchanged baseline must not read a product page')}},policy:{maxScreenshotPagesPerRun:1000},budget:{remaining:()=>10000},state:{details:{},failures:{}},lease:batchClaim.lease,controlCall:batchControl,deferDelivery:true});
 assert.deepEqual(sizes,[500,500,205]);assert.equal(batched.scanned,11205);assert.equal(batched.captured,0);assert.equal(batched.success,true);assert.equal(sent,1,'A large unchanged catalogue neither floods email nor sends an oversized full-catalogue planning request');
 await batchDb.put('sub/native-reader',{email:'native-reader@example.com',scopes:['wreath'],confirmedAt:new Date(Date.now()-60000).toISOString()});
 const nativeProducts=Array.from({length:18},(_,i)=>{const sku=String(880000+i),base='https://g-jayden.github.io/range-christmas-observatory/mail-assets/'+sku+'/';return {sku,newStatus:true,kind:'decoration',department:'wreath',departmentIds:['wreath'],variantName:'Verified wreath '+sku,priceGBP:9.99,sourceUrl:'https://www.therange.co.uk/p/test/#'+sku,mailAssets:{card:{url:base+'card.png'},original:{url:base+'original.jpg'},proof:{url:base+'proof.png'}}}});
 await batchControl('/internal/monitor-plan',{lease:batchClaim.lease,products:nativeProducts});for(const product of nativeProducts)await batchControl('/internal/event',{lease:batchClaim.lease,product,screenshotBase64:'aW1hZ2U='});
 const counts=[],beforeNative=sent;limitInvocationFetches=true;const drained=await deliverVerifiedEvents(async(route,body)=>{invocationFetches=0;const r=await batchControl(route,body);counts.push(r.accepted);return r});limitInvocationFetches=false;assert.deepEqual(counts,[8,8,2]);assert.equal(drained.accepted,18);assert.equal(sent-beforeNative,18);assert.equal(drained.pendingDeliveries,0);
 const capturedProduct={sku:'991990',sourceUrl:'https://www.therange.co.uk/p/test/#991990',priceGBP:12.99,variantImageUrl:'https://www.therange.co.uk/media/991990-thumb.jpg',descriptionHash:'verified-source-description'},captureBytes=Buffer.from('real-page-capture-fixture');let paidCaptures=0;
 const resultFor=()=>({success:true,captured:1,deferred:0,issues:[],events:[{product:{...capturedProduct}}]});
 const savedCapture=await captureNewScreenshots(resultFor(),{reader:{captureVerified:async()=>{paidCaptures++;return captureBytes.toString('base64')},originalsFor:()=>[{url:'https://www.therange.co.uk/media/991990-original.jpg'}]},state:{failures:{}},policy:{failureRetryDays:[1]}});assert.equal(savedCapture.captured,1);
 const recoveredCapture=await captureNewScreenshots(resultFor(),{reader:{captureVerified:async()=>{throw Error('Saved paid screenshot must not be purchased twice')}},state:{failures:{}},policy:{failureRetryDays:[1]}});assert.equal(recoveredCapture.captured,1);assert.equal(paidCaptures,1);assert.equal(recoveredCapture.events[0].screenshotBase64,captureBytes.toString('base64'));
 const imageProducts=[{sku:'1',variantImageUrl:'main1',originalImageUrl:'original1',originalCachedImageUrl:'verified1'},{sku:'2',variantImageUrl:'main2',originalImageUrl:'original2'}],partial=retainVerifiedNewImages({success:true,captured:2,deferred:0,issues:[],events:imageProducts.map(product=>({product}))},{products:imageProducts},{entries:{main1:{ok:true},original1:{ok:true},main2:{ok:true}},failures:[{url:'original2',status:403,error:'Original source unavailable'}]});assert.equal(partial.events.length,1);assert.equal(partial.events[0].product.sku,'1');assert.equal(partial.success,false);assert.equal(partial.deferred,1);assert.equal(partial.issues[0].url,'original2');assert.equal(partial.issues[0].status,403,'A single failed original is diagnosed without blocking the other verified product');
 console.log('PASS: cloud queue survives deploy/runner failure, unpublished attachments prevent sending, recovery uses zero source requests, delivery deduplicates, and expired-lease recovery requires an observed SKU and owner authorization.');
}finally{process.chdir(cwd);globalThis.fetch=original;if(oldActions===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=oldActions;await fs.rm(dir,{recursive:true,force:true});}
