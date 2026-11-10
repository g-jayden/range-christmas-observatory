import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Control} from '../cloud/worker.mjs';
import {dispatchDue} from '../cloud/dispatch-clock.mjs';
import {evidenceDeadline,evidenceRecovery,evidenceRetryDue,completeMonitorState,retryableEvidence} from '../cloud/evidence-recovery.mjs';
import {mailAssetUrl,pinMailAssets,publishedManifestUrl} from '../cloud/published-mail-assets.mjs';
import {publishCollectionCheckpoint} from '../server/collection-checkpoints.mjs';
import {runMonitorDaily} from '../server/update-monitor.mjs';
import {finishNewEvents,reusableNewDetails} from '../server/new-events.mjs';
import {detailFingerprint} from '../server/collection-policy.mjs';
import {categories} from '../server/sync.mjs';

// Every external request below is a local fault fixture. No Firecrawl request
// or real recipient is used; the real collector and Worker handle the faults.
class Store{
 constructor(){this.m=new Map()}
 async get(k){return structuredClone(this.m.get(k))}
 async put(k,v){if(typeof k==='object')for(const[a,b]of Object.entries(k))this.m.set(a,structuredClone(b));else this.m.set(k,structuredClone(v))}
 async delete(k){return this.m.delete(k)}
 async list({prefix}){return new Map([...this.m].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]))}
 async transaction(fn){return fn(this)}
}
const dayNow=Date.parse('2026-11-08T23:01:00Z'),sourceAt='2026-11-08T23:00:00Z';
let m=completeMonitorState({sourceAttempts:2,lastSuccess:'2026-11-07T23:00:00Z'},{success:false,catalogueReady:true,sourceObservedAt:sourceAt,evidenceRetryable:true}, {},dayNow);
assert.equal(m.state,'evidence-pending');assert.equal(m.sourceAttempts,0);assert.equal(m.evidenceAttempts,1);assert.equal(m.evidenceRetryAt,'2026-11-08T23:06:00.000Z');
assert.equal(m.lastSuccess,'2026-11-07T23:00:00Z','Unverified evidence cannot advance success');
assert(evidenceRetryDue(m,dayNow+5*60000));
let dispatches=0;const dbClock=new Store;
const dispatched=await dispatchDue({storage:dbClock,env:{GITHUB_DISPATCH_TOKEN:'fixture',BREVO_API_KEY:'fixture',MAIL_FROM:'sender@example.invalid'},initialized:true,now:dayNow+5*60000,config:{nextRunAt:'2026-11-20T16:00:00Z'},monitor:{...m,nextRunAt:'2026-11-09T23:00:00Z'},fetcher:async()=>{dispatches++;return new Response(null,{status:204})}});
assert(dispatched.dispatched);assert.equal(dispatches,1);assert.equal(dispatched.firecrawlCredits,0);
m={...m,...evidenceRecovery(m,{success:false,retryable:true,now:dayNow+5*60000})};assert.equal(m.evidenceRetryAt,'2026-11-08T23:21:00.000Z');
m={...m,...evidenceRecovery(m,{success:false,retryable:true,now:dayNow+20*60000})};assert.equal(m.evidenceAttempts,3);assert.equal(m.evidenceRetryAt,null);assert(m.evidenceRetryExhausted);
assert.equal(evidenceRetryDue(m,dayNow+40*60000),false);
assert.equal(evidenceDeadline('2026-11-09T15:58:00Z'),'2026-11-09T16:00:00.000Z','Evidence never carries yesterday into today');
assert.equal(evidenceRecovery({}, {success:false,retryable:true,sourceAt:'2026-11-09T15:58:00Z',now:Date.parse('2026-11-09T15:59:00Z')}).evidenceRetryAt,null);
for(const status of [400,401,402,404,422])assert.equal(retryableEvidence({issues:[{status}]}),false);
for(const status of [0,403,408,429,500,502,503,504])assert(retryableEvidence({issues:[{status}]}));

const rev='a'.repeat(40),base='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/mail-assets/990001/';
const originalManifest={sku:'990001',card:{url:base+'card.png'},original:{url:base+'original.jpg',sourceUrl:'https://www.therange.co.uk/media/source.jpg',sha256:'source-hash'},mailOriginal:{url:base+'original-lossless.png'},proof:{url:base+'proof.png'}};
const pinned=pinMailAssets(originalManifest,rev);
assert(pinned.card.url.includes('/'+rev+'/'));assert.equal(pinned.original.sourceUrl,originalManifest.original.sourceUrl);assert.equal(pinned.original.sha256,'source-hash');assert(originalManifest.card.url.includes('/main/'));
assert.equal(publishedManifestUrl({sku:'990001',mailAssets:pinned}),base.replace('/main/','/'+rev+'/')+'manifest.json');
for(const url of [base.replace('g-jayden/','attacker/'),base.replace('/990001/','/990002/'),base.replace('/main/','/other-branch/'),'https://g-jayden.github.io.evil.invalid/range-christmas-observatory/mail-assets/990001/card.png'])assert.throws(()=>mailAssetUrl(url,'990001'));
assert.throws(()=>pinMailAssets(originalManifest,'main'));
assert.throws(()=>publishedManifestUrl({sku:'990002',mailAssets:pinned}));

let commands=[];const fakeRun=(bin,args)=>{commands.push([bin,args]);if(args[0]==='diff')throw Object.assign(Error('changed'),{status:1});if(args[0]==='rev-parse')return rev;};
assert.equal(await publishCollectionCheckpoint({}, {env:{},run:()=>{throw Error('Unit tests must never push')}}),null);
await assert.rejects(publishCollectionCheckpoint({}, {env:{COLLECTION_CHECKPOINTS:'1'},run:fakeRun}));
assert.equal((await publishCollectionCheckpoint({stage:'discovery'}, {env:{COLLECTION_CHECKPOINTS:'1',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'g-jayden/range-christmas-observatory',GITHUB_RUN_ID:'123'},run:fakeRun})).revision,rev);
assert(commands.some(([,args])=>args.includes('scripts/push-evidence.mjs')));

const fixtureBytes=Buffer.from('verified-local-image-fixture'),fixtureHash=createHash('sha256').update(fixtureBytes).digest('hex');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'range-resilience-')),cwd=process.cwd(),priorFetch=globalThis.fetch,priorNow=Date.now,envBefore=Object.fromEntries(['GITHUB_ACTIONS','NOTIFICATION_PHASE','COLLECTION_MODE'].map(k=>[k,process.env[k]]));
try{
 Date.now=()=>Date.parse('2026-11-09T01:00:00Z');
 process.env.GITHUB_ACTIONS='true';delete process.env.NOTIFICATION_PHASE;delete process.env.COLLECTION_MODE;
 async function scenario(name,{badPhoto=false,failedPush=false,maintenanceFailure=false,fresh=false}={}){
  const dir=path.join(root,name);await fs.mkdir(path.join(dir,'web'),{recursive:true});process.chdir(dir);
  const now=Date.now(),observedAt=new Date(now-60000).toISOString(),storage=new Store,order=[],manifests=new Map;let mails=0,sourceRequests=0,stage=0;
  const app=new Control({storage},{CONTROL_TOKEN:'fixture-control',BREVO_API_KEY:'fixture-mail',MAIL_FROM:'sender@example.invalid'});
  const call=async(route,body)=>{order.push(route);const r=await app.fetch(new Request('https://fixture.invalid'+route,{method:'POST',headers:{authorization:'Bearer fixture-control','content-type':'application/json'},body:JSON.stringify(body)}));const b=await r.json();if(!r.ok)throw Object.assign(Error(b.error),{status:r.status});return b;};
  await storage.put('seeded',true);await storage.put('config',{nextRunAt:new Date(now-3600000).toISOString()});await storage.put('monitor',{scheduleVersion:'daily-0700-v1',nextRunAt:new Date(now-60000).toISOString()});await storage.put('sub/reader',{email:'reader@example.invalid',scopes:['tree'],confirmedAt:new Date(now-3600000).toISOString(),unsubscribe:'fixture'});
  const claim=await call('/internal/claim',{forceMonitor:true});assert.equal(claim.monitor,true);assert.equal(claim.full,false,'Due full refresh must yield to the daily NEW check');
  const makeProduct=sku=>{const p={sku,kind:'tree',variantName:'6ft Green Artificial Christmas Tree',sourceUrl:'https://www.therange.co.uk/christmas/trees/p'+sku+'/#'+sku,productPath:'christmas/trees/p'+sku,variantId:'v'+sku,variantImageUrl:'https://www.therange.co.uk/media/'+sku+'.jpg',originalImageUrl:'https://www.therange.co.uk/media/'+sku+'-original.jpg',originalImages:[{url:'https://www.therange.co.uk/media/'+sku+'-original.jpg',variantId:'v'+sku}],priceGBP:29.99,observedAt,attributeObservedAt:observedAt,detailEvidence:{selectedSku:sku,verifiedProductSection:true},detailsReady:true,specifications:{Colour:'Green',Height:'180cm',Material:'PVC'},sourceDescription:'A green artificial Christmas tree made from PVC.',newStatus:true,arrivalEvidence:'observed-after-baseline',firstNewObservedAt:observedAt};p.detailInputFingerprint=detailFingerprint(p);return p;};
  const products=[makeProduct('990001'),...(badPhoto?[makeProduct('990002')]:[])],snapshot={observedAt,products,sources:Object.fromEntries(Object.keys(categories).map(k=>[k,{complete:true,expected:products.length,unique:products.length}]))};
  assert(reusableNewDetails(products[0],{retryPendingNow:true},now));assert.equal(reusableNewDetails({...products[0],variantName:'Other tree'},{retryPendingNow:true},now),false);assert.equal(reusableNewDetails(products[0],{retryPendingNow:true},now+7*3600000),false);
  // Use a completed, fresh source checkpoint to exercise evidence-only recovery.
  if(!fresh)await fs.writeFile('web/monitor-proof.json',JSON.stringify({success:false,catalogueReady:true,mode:'daily-new-only',observedAt,completedAt:observedAt}));
  globalThis.fetch=async(url,options={})=>{
   const u=String(url);if(u==='https://api.brevo.com/v3/smtp/email'){const b=JSON.parse(options.body);assert.equal(b.to[0].email,'reader@example.invalid');assert(b.attachment.every(a=>a.url.includes('/'+rev+'/')));mails++;order.push('mail-accepted');return Response.json({messageId:'fixture-'+mails},{status:201});}
   assert(u.includes('/'+rev+'/'),'Pages and mutable main must not be required for a queued attachment');
   if(u.endsWith('/manifest.json')){const sku=u.split('/').at(-2);assert(manifests.has(sku));return Response.json(manifests.get(sku));}
   if(options.method==='HEAD')return new Response(null,{headers:{'content-type':'image/png'}});
   return new Response(fixtureBytes,{headers:{'content-type':'image/png'}});
  };
  const builder=async p=>{assert(p.originalCachedImageUrl,'Missing originals cannot be queued');const b='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/mail-assets/'+p.sku+'/';p.mailAssets={sku:p.sku,sourceUrl:p.sourceUrl,priceGBP:p.priceGBP,cardVersion:'test-fixture',evidenceMode:'verified-information-card',card:{url:b+'card.png',sha256:fixtureHash,bytes:fixtureBytes.length},original:{url:b+'original.jpg',sourceUrl:p.originalImageUrl,sha256:fixtureHash,bytes:fixtureBytes.length}};manifests.set(p.sku,structuredClone(p.mailAssets));return {attachmentBase64:null,downloadUrl:'https://fixture.invalid/product',attachmentKind:'verified-information-card'};};
  const publisher=async({stage:s})=>{order.push('publish-'+s);stage++;if(failedPush&&s==='new-assets')throw Error('GitHub file publication interrupted');return {published:true,revision:rev};};
  const reader={raw:async url=>{sourceRequests++;if(!fresh)throw Error('Paid PDP must be reused');const p=products.find(p=>p.sourceUrl===url);return {success:true,data:{metadata:{statusCode:200},sourceVariant:{sku:p.sku,code:p.sku,id:p.variantId,prod_id:'family',product_specification:['Colour: Green','Height: 180cm','Material: PVC']},familyEvidence:{url:url.split('#')[0],jsonUrl:url.split('#')[0]+'?json',productId:'family',features:['Green artificial Christmas tree'],information:p.sourceDescription,observedAt,offers:[{sku:p.sku,image:p.variantImageUrl}],gallery:[{url:p.variantImageUrl,variants:[p.variantId]}],originalGallery:[{url:p.originalImageUrl,thumbnail:p.variantImageUrl,variants:[p.variantId]}]}}};},prepareFamilies:async()=>{if(!fresh)throw Error('Paid families must be reused')},captureVerified:async()=>{sourceRequests++;throw Error('Verified card does not need a paid page screenshot')},auditImages:async rows=>{const entries={},failures=[];for(const p of rows){const url=p.variantImageUrl;if(badPhoto&&p.sku==='990002-original'){failures.push({url,status:403,error:'Fixture original refused'});continue;}entries[url]={ok:true,width:1500,height:1500};if(p.sku.endsWith('-original')){p.cachedImageUrl='images/source/fixture.jpg';p.imageCacheEvidence={sourceUrl:url,sha256:fixtureHash};}}return {entries,failures,failed:failures.length};},closeBrowser:async()=>{},close:async()=>{},metrics:()=>({firecrawlCredits:0})};
  reader.familyReady=()=>fresh;
  const result=await runMonitorDaily({previous:snapshot,policy:{retailerId:'the-range-gb',catalogueTransport:'enhanced-batch',maxCreditsPerRun:60,maxScreenshotPagesPerRun:60,failureRetryDays:[1]},readerFactory:async()=>reader,budgetFactory:async()=>({remaining:()=>0,settle:async({credits})=>assert.equal(credits,0)}),now:()=>now,collectSnapshot:async()=>{sourceRequests++;if(!fresh)throw Error('Saved complete source must not be purchased again');return {snapshot};},controlCall:call,tick:{monitor:true,monitorLease:claim.lease},publishCheckpoint:publisher,buildAssets:builder,maintain:async()=>{order.push('maintenance');if(maintenanceFailure){assert(order.includes('mail-accepted'),'A NEW email must already be accepted before old product maintenance begins');throw Object.assign(Error('Unrelated old SKU HTTP 403'),{status:403});}return {success:true};}});
  const monitor=await app.monitorState();assert.equal(sourceRequests,fresh?products.length+1:0);assert(stage>=2);assert(order.indexOf('publish-discovery')<order.indexOf('/internal/discovery-ready'));
  if(failedPush){assert.equal(result.success,false);assert.equal(mails,0);assert.equal(await storage.get('seen/990001'),undefined,'A failed publication must never mark a product seen');assert.equal((await storage.list({prefix:'pending/'})).size,1);assert.equal(monitor.state,'evidence-pending');}
  else{assert.equal(mails,1);assert(order.indexOf('publish-new-assets')<order.indexOf('/internal/event'));assert.equal((await storage.get('event/990001')).mailAssets.publishedRevision,rev);assert.equal((await storage.list({prefix:'delivered/990001/'})).size,1);
   await call('/internal/classification-sync',{version:'fixture-new-classification',products:[{sku:'990001',disposition:'include',primary:'tree',memberships:['tree'],mailAssets:{...manifests.get('990001'),priceGBP:1.99}}]});
   const frozen=await storage.get('event/990001');assert.equal(frozen.mailAssets.publishedRevision,rev);assert.equal(frozen.priceGBP,29.99,'Later catalogue updates cannot change a queued event or its original offer');
   await call('/internal/deliver',{});assert.equal(mails,1,'A rerun cannot duplicate an accepted message');
   if(badPhoto){assert.equal(result.success,false);assert.equal(monitor.state,'evidence-pending');assert.equal(monitor.sourceAttempts,0);assert.equal(monitor.evidenceAttempts,1);assert.equal(await storage.get('seen/990002'),undefined);assert(await storage.get('pending/990002'));assert.equal(evidenceRetryDue(monitor,now+5*60000+1000),true);}
   else assert.equal(result.success,true);
  }
  return {result,order,monitor,dir,call};
 }
 const partial=await scenario('one-original-refused',{badPhoto:true});
 await scenario('publication-interrupted',{failedPush:true});
  const maintained=await scenario('fresh-NEW-before-old-maintenance',{fresh:true,maintenanceFailure:true});assert.equal(maintained.result.state.lastResult.maintenance.success,false);
 // Fresh discovery rather than evidence-only recovery must also send before
 // unrelated catalogue maintenance; old SKU failures are deliberately thrown.
 const dir=path.join(root,'maintenance');await fs.mkdir(path.join(dir,'web'),{recursive:true});process.chdir(dir);
 const order=[];const snapshot={observedAt:new Date().toISOString(),products:[]};
 const noNew=await runMonitorDaily({previous:snapshot,policy:{retailerId:'the-range-gb'},readerFactory:async()=>({close:async()=>{},metrics:()=>({firecrawlCredits:0})}),budgetFactory:async()=>({settle:async()=>{}}),collectSnapshot:async()=>({snapshot}),controlCall:async(route)=>{order.push(route);return route.endsWith('monitor-plan')?{candidates:[]}:route.endsWith('deliver')?{accepted:0,pendingDeliveries:0}:{};},publishCheckpoint:async()=>({published:true,revision:rev}),maintain:async()=>{assert(order.includes('/internal/monitor-complete'));throw Error('Old SKU maintenance failure');}});
 assert.equal(noNew.success,true);const report=JSON.parse(await fs.readFile('web/monitor-proof.json'));assert.equal(report.maintenance.success,false);assert.match(report.maintenance.error,/Old SKU/);assert.equal(report.notification.success,true);
 // The publication guard also protects direct queue callers from runner loss.
 let events=0;await assert.rejects(finishNewEvents({success:true,scanned:1,events:[{product:{sku:'990001',kind:'tree',variantName:'Christmas Tree',sourceUrl:'https://www.therange.co.uk/p/tree/#990001',mailAssets:originalManifest},screenshotBase64:'cGl4ZWxz'}]}, {snapshot:{products:[{sku:'990001',kind:'tree',variantName:'Christmas Tree',sourceUrl:'https://www.therange.co.uk/p/tree/#990001',mailAssets:originalManifest}]},publishCheckpoint:async()=>{throw Error('Publication failed')},controlCall:async()=>{events++}}));assert.equal(events,0);
 console.log('PASS: automatic evidence clock; 3-attempt/day/deadline limits; exact-commit attachments; publication-before-seen; good NEW delivered despite refused original; no duplicate mail; zero source requests during recovery; verified details still delivered at zero remaining request budget; unrelated maintenance isolated.');
}finally{process.chdir(cwd);globalThis.fetch=priorFetch;Date.now=priorNow;for(const[k,v]of Object.entries(envBefore)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await fs.rm(root,{recursive:true,force:true});}
