import assert from 'node:assert/strict';import {firstRun,advanceRun,validateSchedule,nextNewCheck,advanceNewCheck} from '../server/schedule.mjs';import handler,{Control} from '../cloud/worker.mjs';import {retryingReader} from '../server/retry-reader.mjs';
const start=new Date('2026-10-30T08:20:00Z');
assert.equal(nextNewCheck(new Date('2026-10-30T09:00:00Z')),'2026-10-30T23:00:00.000Z');
assert.equal(nextNewCheck(new Date('2026-11-03T22:59:00Z')),'2026-11-03T23:00:00.000Z');
assert.equal(nextNewCheck(new Date('2026-11-03T23:00:00Z')),'2026-11-04T23:00:00.000Z');
assert.equal(advanceNewCheck('2026-11-03T23:00:00Z',new Date('2026-11-03T23:07:00Z')),'2026-11-04T23:00:00.000Z');
assert.equal(firstRun({},start).nextRunAt,'2026-11-05T16:00:00.000Z');
assert.equal(validateSchedule({intervalDays:'',time:'19:25'}).time,'00:00');
assert.equal(firstRun({intervalDays:3,time:'23:59'},start).nextRunAt,'2026-11-02T15:59:00.000Z');
assert.equal(advanceRun(firstRun({},start),new Date('2026-11-22T08:00:00Z')).nextRunAt,'2026-11-26T16:00:00.000Z');
for(const v of [{intervalDays:1},{intervalDays:30},{intervalDays:7,time:'24:00'},{intervalDays:7,time:'1:00'},{intervalDays:7,time:'12:60'}])assert.throws(()=>validateSchedule(v));
class Store{
 constructor(){this.m=new Map}
 async get(k){return structuredClone(this.m.get(k))}
 async put(k,v){if(typeof k==='object')for(const[a,b]of Object.entries(k))this.m.set(a,structuredClone(b));else this.m.set(k,structuredClone(v))}
 async delete(k){return this.m.delete(k)}
 async list({prefix}){return new Map([...this.m].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))}
 async transaction(fn){return fn(this)}
}
const storage=new Store,env={ADMIN_TOKEN:'admin',CONTROL_TOKEN:'control',BREVO_API_KEY:'test-only',MAIL_FROM:'sender@example.com'},app=new Control({storage},env),sent=[];
const original=globalThis.fetch;globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');sent.push(JSON.parse(opts.body));return Response.json({messageId:'test-'+sent.length},{status:201})};
async function call(path,body,secret){return app.fetch(new Request('https://worker.example'+path,{method:body===undefined?'GET':'POST',headers:{...(secret?{authorization:'Bearer '+secret}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)}))}
try{
 assert.equal((await call('/admin/schedule',{intervalDays:3,time:'04:17'})).status,401);
 assert.equal((await call('/admin/schedule',{intervalDays:3,time:'04:17'},'admin')).status,200);
 assert.equal((await(await call('/public/status')).json()).config.time,'04:17');
 await call('/internal/seed',{records:[{sku:'100',everNew:true},{sku:'101',everNew:false}]},'control');
 let attempts=0;const flaky=retryingReader(async()=>{if(++attempts<3)throw Object.assign(Error('internal proxy error'),{status:502});return 'ok'},{delayMs:0});assert.equal(await flaky('test'),'ok');assert.equal(attempts,3);
 const regular=await(await call('/internal/claim',{},'control')).json();assert.equal(regular.monitor,false,'The old 15-minute timer must not scan source products before the next daily07:00 time');
 const claim=await(await call('/internal/claim',{forceMonitor:true},'control')).json();assert.equal(claim.monitor,true);
 const rows=[{sku:'100',newStatus:true,sourceUrl:'https://www.therange.co.uk/p/test/#100'},{sku:'101',newStatus:true,sourceUrl:'https://www.therange.co.uk/p/test/#101'}];
 const plan=await(await call('/internal/monitor-plan',{lease:claim.lease,products:rows},'control')).json();assert.deepEqual(plan.candidates.map(p=>p.sku),['101']);
 assert.equal((await call('/subscribe',{email:'reader@example.com',scopes:['tree']})).status,200);assert.equal(sent.length,1);
 const confirmationLink=sent[0].htmlContent.match(/https:\/\/[^" ]+\/confirm\.html#token=[^" ]+/)[0];assert(confirmationLink.startsWith('https://g-jayden.github.io/range-christmas-observatory/confirm.html#token='));const confirmUrl='https://worker.example/confirm',form=new URLSearchParams({token:new URLSearchParams(new URL(confirmationLink).hash.slice(1)).get('token')});
 const before=await call('/public/status');assert.ok(!(await before.text()).includes('reader@example.com'));
 const frontEnv={CONTROL:{getByName:()=>app}};
 const blocked=await handler.fetch(new Request(confirmUrl,{method:'POST',headers:{origin:'https://unrelated.example'},body:form}),frontEnv);assert.equal(blocked.status,403);
 const verified=await handler.fetch(new Request(confirmUrl,{method:'POST',headers:{origin:new URL(confirmUrl).origin},body:form}),frontEnv);assert.equal(verified.status,200,'The confirmation form hosted on the API origin must be allowed to POST');
 for(const [k,v]of await storage.list({prefix:'sub/'})){v.confirmedAt=new Date(Date.now()-10000).toISOString();await storage.put(k,v)}
 const pendingPlan=await(await call('/internal/monitor-plan',{lease:claim.lease,products:[]},'control')).json();assert.deepEqual(pendingPlan.candidates.map(p=>p.sku),['101'],'Detected NEW remains pending if the next list no longer carries its NEW flag');
 const p={...rows[1],kind:'tree',priceGBP:12.99,variantName:'Test <tree>',description:'Actual source product information'};
 assert.equal((await call('/internal/event',{lease:claim.lease,product:p},'control')).status,422);
 await call('/internal/event',{lease:claim.lease,product:p,screenshotBase64:Buffer.from('image-bytes').toString('base64'),screenshotVerifiedAt:new Date().toISOString()},'control');
 await call('/internal/deliver',{},'control');assert.equal(sent.length,2);assert.equal(sent[1].to[0].email,'reader@example.com');assert.equal(sent[1].attachment[0].name,'NEW-101.png');assert.ok(sent[1].htmlContent.includes('Test &lt;tree&gt;'));
 await call('/internal/deliver',{},'control');assert.equal(sent.length,2,'An already accepted event must not be sent twice');
 const cancelled=await call('/unsubscribe-by-email',{email:'reader@example.com'});assert.equal(cancelled.status,200);assert.equal((await storage.list({prefix:'sub/'})).size,0);assert.equal((await storage.list({prefix:'token/'})).size,0);await call('/internal/deliver',{},'control');assert.equal(sent.length,2,'Unsubscribed address receives no further events');
 const absent=await call('/unsubscribe-by-email',{email:'not-present@example.com'});assert.deepEqual(await absent.json(),await cancelled.json(),'Unsubscribe does not reveal whether an address was subscribed');
 const publicView=JSON.stringify(await(await call('/public/status')).json());assert.ok(!publicView.includes('reader@example.com'));assert.ok(!publicView.includes('screenshotBase64'));
 await call('/internal/monitor-complete',{lease:claim.lease,success:false,error:'Source unavailable'},'control');const state=await(await call('/public/status')).json();assert.equal(state.monitor.state,'error');assert.equal(state.monitor.lastSuccess,null);
 const missingMail=new Control({storage:new Store},{ADMIN_TOKEN:'admin',CONTROL_TOKEN:'control'});assert.equal((await missingMail.fetch(new Request('https://worker.example/subscribe',{method:'POST',body:JSON.stringify({email:'reader@example.com'})}))).status,503);
 const migrationStore=new Store,migrationApp=new Control({storage:migrationStore},env);const migration=new Request('https://worker.example/internal/seed',{method:'POST',headers:{authorization:'Bearer control'},body:JSON.stringify({records:[{sku:'101',everNew:true}],confirmedSubscriptions:[{email:'migrated@example.com',scopes:['tree','skirt'],confirmedAt:'2026-11-01T00:00:00Z'}]})});assert.equal((await migrationApp.fetch(migration)).status,200);assert.equal((await migrationStore.list({prefix:'sub/'})).size,1);assert.equal(await migrationStore.get('seen/101'),true);
 const testStore=new Store,testApp=new Control({storage:testStore},env),email='test-reader@example.com';
 const id=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email)))].map(v=>v.toString(16).padStart(2,'0')).join('');await testStore.put('sub/'+id,{email,confirmedAt:new Date().toISOString(),scopes:['tree']});
 const assetBase='https://g-jayden.github.io/range-christmas-observatory/mail-assets/101/';
 const testProduct={...p,newStatus:true,mailAssets:{card:{url:assetBase+'card.png'},original:{url:assetBase+'original.jpg',width:1500,height:1500},proof:{url:assetBase+'proof.png'}}};
 const testCall=product=>testApp.fetch(new Request('https://worker.example/internal/test-email',{method:'POST',headers:{authorization:'Bearer control','content-type':'application/json'},body:JSON.stringify({email,product,requestId:'verified-image-test-1'})}));
 const count=sent.length;assert.equal((await testCall(testProduct)).status,200);assert.equal(sent.length,count+1);assert.equal(sent.at(-1).attachment.length,3);assert.ok(sent.at(-1).htmlContent.includes('1500×1500'));assert.ok(sent.at(-1).subject.startsWith('【测试】'));
 assert.equal((await testCall(testProduct)).status,200);assert.equal(sent.length,count+1,'Explicit test delivery is idempotent');assert.equal(await testStore.get('seen/101'),undefined,'Tests must not modify the real NEW baseline');
 const invalid=structuredClone(testProduct);invalid.mailAssets.card.url='https://unrelated.example/card.png';assert.equal((await testCall(invalid)).status,500);assert.equal(sent.length,count+1,'Assets outside the published SKU directory cannot be emailed');
 console.log('PASS: Beijing schedule, 3/5/7 validation, missed-run advance, owner authorization, private subscription confirmation, NEW baseline exclusion, real-screenshot requirement, delivery deduplication, public-email exclusion and truthful failure status.');
}finally{globalThis.fetch=original}
