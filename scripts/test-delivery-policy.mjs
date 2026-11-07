import assert from 'node:assert/strict';
import {Control} from '../cloud/worker.mjs';
import {monitorLabel} from '../web/monitor-labels.mjs';
import {deliveryFailure,retryState,hasReadyDeliveries} from '../cloud/delivery-policy.mjs';
class Store{
 constructor(){this.data=new Map;}
 async get(k){return structuredClone(this.data.get(k));}
 async put(k,v){this.data.set(k,structuredClone(v));}
 async delete(k){return this.data.delete(k);}
 async list({prefix}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));}
 async transaction(fn){return fn(this);}
}
const at=1000000,temporary=Object.assign(Error('temporary'),{providerStatus:503});let record;
for(let i=0;i<3;i++){record=deliveryFailure(record,'same',temporary,at+i*600000);assert.equal(record.attempts,i+1);assert.equal(retryState(record,'same',at+i*600000),i===2?'blocked':'waiting');}
assert.equal(retryState(record,'same',at+86400000),'blocked');assert.equal(retryState(record,'repaired-payload',at),'ready');
assert.equal(deliveryFailure(null,'same',{providerStatus:400,providerCode:'invalid_parameter'},at).blocked,true);
assert.equal(hasReadyDeliveries({pendingDeliveries:10,readyDeliveries:0}),false);
assert.match(monitorLabel({state:'delivery-blocked',pendingDeliveries:2,blockedDeliveries:1}),/Pending: 2.*Blocked: 1/);assert(!monitorLabel({state:'delivery-blocked',pendingDeliveries:2}).includes('Daily schedule active'));
assert.equal(hasReadyDeliveries({pendingDeliveries:10}),true,'Maintain compatibility while the control deployment changes');
const db=new Store,app=new Control({storage:db},{CONTROL_TOKEN:'control-test',BREVO_API_KEY:'not-a-real-key',MAIL_FROM:'sender@example.invalid'}),original=globalThis.fetch;
const product=sku=>{const base='https://g-jayden.github.io/range-christmas-observatory/mail-assets/'+sku+'/';return {sku,kind:'skirt',variantName:'Exact SKU '+sku,newStatus:true,detectedAt:new Date().toISOString(),sourceUrl:'https://www.therange.co.uk/p/test/#'+sku,priceGBP:10,mailAssets:{card:{url:base+'card.png',sha256:'card'},original:{url:base+'original.webp',sha256:'native-source'},proof:{url:base+'proof.png'}}};};
const invoke=async()=>{const r=await app.fetch(new Request('https://worker.example/internal/deliver',{method:'POST',headers:{authorization:'Bearer control-test'}}));assert.equal(r.status,200);return r.json();};
await db.put('sub/reader',{email:'reader@example.invalid',scopes:['skirt'],confirmedAt:new Date(Date.now()-60000).toISOString()});
let sends=0,requests=0,successful=[];
try{
 globalThis.fetch=async(url,opts)=>{
  requests++;assert(requests<=40,'Failed items also count toward the free Worker fetch limit');
  if(opts.method==='HEAD')return new Response(null,{status:200,headers:{'content-type':'image/png'}});
  assert.equal(url,'https://api.brevo.com/v3/smtp/email');sends++;const body=JSON.parse(opts.body),sku=/Exact SKU (\d+)/.exec(body.subject)[1];
  if(body.attachment.some(a=>a.url.endsWith('.webp')))return Response.json({code:'invalid_parameter',message:'Unsupported file format: webp'},{status:400});
  successful.push(sku);return Response.json({messageId:'receipt-'+sku},{status:201});
 };
 const bad=product('100001'),good=product('100002');good.mailAssets.original.url=good.mailAssets.original.url.replace('.webp','.jpg');await db.put('event/'+bad.sku,bad);await db.put('event/'+good.sku,good);
 let r=await invoke();assert.equal(r.accepted,1);assert.equal(r.failed,1);assert.deepEqual(successful,['100002'],'The bad SKU sorts first but must not prevent later healthy mail');assert.equal(r.blockedDeliveries,1);assert.equal(r.readyDeliveries,0);assert.equal(r.morePending,false);assert.equal((await db.get('last-delivery')).accepted,1);
 requests=0;const before=sends;r=await invoke();assert.equal(sends,before);assert.equal(requests,0,'An unchanged permanent failure must not fetch attachments or retry the provider');
 bad.mailAssets.mailOriginal={url:bad.mailAssets.original.url.replace('original.webp','original-lossless.png'),sha256:'lossless-png'};await db.put('event/'+bad.sku,bad);requests=0;r=await invoke();assert.equal(r.accepted,1);assert.equal(r.pendingDeliveries,0);assert.equal((await db.get('monitor')).state,'active');assert.equal((await db.get('monitor')).lastError,null);assert.deepEqual(successful,['100002','100001']);
 for(let i=0;i<10;i++)await db.put('event/'+(200000+i),product(String(200000+i)));
 requests=0;const batch=await invoke();assert.equal(batch.attempted,8);assert.equal(batch.failed,8);assert.equal(batch.accepted,0);assert.equal(batch.morePending,true);assert.equal(batch.readyDeliveries,2,'Cap eight attempts, not just eight successful sends');requests=0;const tail=await invoke();assert.equal(tail.failed,2);assert.equal(tail.blockedDeliveries,10);assert.equal(tail.morePending,false);
 const first=await db.get('event/200000');first.mailAssets.mailOriginal={url:first.mailAssets.original.url.replace('original.webp','original-lossless.png'),sha256:'repaired'};await db.put('event/200000',first);requests=0;r=await invoke();assert.equal(r.accepted,1);assert.equal(r.blockedDeliveries,9);assert.equal(r.morePending,false);
 assert.equal((await app.deliveryStatus()).pendingDeliveries,9,'Blocked items remain visible and are never counted as delivered');
 const pub=JSON.stringify(await app.deliveryStatus());assert(!pub.includes('reader@example.invalid'));assert(!pub.includes('not-a-real-key'));
 console.log('PASS: isolated bad SKU, lossless PNG unblocks it, durable per-message receipts, retry backoff and limit, failed-attempt fetch budget, no repeated source/provider calls, no false success.');
}finally{globalThis.fetch=original;}
