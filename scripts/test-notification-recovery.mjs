import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Control} from '../cloud/worker.mjs';
import {finishNewEvents} from '../server/new-events.mjs';
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
let published=false,sent=0;
async function request(route,body,secret='control'){
 return app.fetch(new Request('https://worker.example'+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));
}
async function controlCall(route,body){const r=await request(route,body),d=await r.json();if(!r.ok)throw Error(d.error);return d;}
try{
 process.chdir(dir);process.env.GITHUB_ACTIONS='true';
 globalThis.fetch=async(url,opts)=>{
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
 console.log('PASS: cloud queue survives deploy/runner failure, unpublished attachments prevent sending, recovery uses zero source requests, delivery deduplicates, and expired-lease recovery requires an observed SKU and owner authorization.');
}finally{process.chdir(cwd);globalThis.fetch=original;if(oldActions===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=oldActions;await fs.rm(dir,{recursive:true,force:true});}
