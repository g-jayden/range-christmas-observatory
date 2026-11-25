import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dailyDigestPlans,deliverDailyDigest,preparedDigestKey} from '../cloud/daily-digest.mjs';
import {dispatchDigestDue} from '../cloud/digest-clock.mjs';
import {deliverPreparedDigests} from '../cloud/prepared-digests.mjs';

class DB{
 constructor(rows=[]){this.rows=new Map(rows);}
 async get(k){return this.rows.get(k);}
 async put(k,v){this.rows.set(k,v);}
 async delete(k){this.rows.delete(k);}
 async list({prefix}){return new Map([...this.rows].filter(([k])=>k.startsWith(prefix)));}
 async transaction(fn){return fn(this);}
}
const early=Date.parse('2026-11-25T22:30:00Z'),seven=Date.parse('2026-11-25T23:00:00Z');
const product={sku:'12345',kind:'tree',department:'tree',departmentIds:['tree'],sourceUrl:'https://www.therange.co.uk/fixture',priceGBP:19.99,detectedAt:'2026-11-25T22:15:00Z',detailEvidence:{sourceContentHash:'a'.repeat(64)}};
const initial=()=>new DB([['sub/a',{email:'fixture@example.invalid',confirmedAt:'2026-11-01',scopes:['tree'],unsubscribe:'fixture'}],['monitor',{lastDiscoverySuccess:'2026-11-25T22:10:00Z'}],['event/12345',structuredClone(product)]]);
const bytes=Buffer.from('%PDF-1.4\nlocal scheduled-report fixture'),revision='b'.repeat(40),env={DAILY_PDF_DIGEST:'true',GITHUB_DISPATCH_TOKEN:'fixture'};
let sends=0,dispatches=0,reads=0;
const send=async()=>{sends++;return 'fixture-receipt';};
const publication=plan=>({version:'daily-native-pdf-v1',planId:plan.id,planFingerprint:plan.fingerprint,day:plan.day,pdf:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},items:plan.products.map(p=>({key:p.digestProductKey,sku:p.sku,retailerId:'the-range',sourceUrl:p.sourceUrl,priceGBP:p.priceGBP,size:'Height 120cm',imageSourceUrl:'https://www.therange.co.uk/media/fixture.jpg',imageSha256:'c'.repeat(64)}))});
const reader=manifest=>async url=>{reads++;if(url.includes('api.github.com')){dispatches++;return new Response(null,{status:204});}return url.endsWith('manifest.json')?Response.json(manifest):new Response(bytes);};
const db=initial();assert((await dailyDigestPlans(db,{now:early})).notDue);
assert((await dailyDigestPlans(db,{now:early-3600000,prepareAhead:true})).notDue,'No source closure can start a report before 06:00');
const plan=(await dailyDigestPlans(db,{now:early,prepareAhead:true})).plans[0];assert(plan);
const manifest=publication(plan),fetcher=reader(manifest),body={id:plan.id,revision,fingerprint:plan.fingerprint};
const saved=await deliverDailyDigest(db,{body,send,origin:'https://fixture.invalid',fetcher,now:early});
assert(saved.scheduled);assert.equal(sends,0);assert.equal(saved.mailSent,false);assert(await db.get(preparedDigestKey(plan.day,plan.recipient)));assert(!await db.get('digest-intent/'+plan.day+'/'+plan.recipient));
assert.equal((await dispatchDigestDue({storage:db,env,now:early+60000,send,origin:'https://fixture.invalid',fetcher})).preparedReports,1);assert.equal(dispatches,0,'An already verified pinned report must not start another GitHub preparation job');
assert.equal((await deliverPreparedDigests({storage:db,now:seven-1,send,origin:'https://fixture.invalid',fetcher})).attempted,0);assert.equal(sends,0);
assert((await dispatchDigestDue({storage:db,env,now:seven,send,origin:'https://fixture.invalid',fetcher})).mailSent);assert.equal(sends,1,'The 07:00 Worker sends without waiting for a new GitHub runner');
assert(await db.get('digest-sent/2026-11-26/a'));assert(!await db.get(preparedDigestKey(plan.day,plan.recipient)));
await dispatchDigestDue({storage:db,env,now:seven+300000,send,origin:'https://fixture.invalid',fetcher});assert.equal(sends,1);assert.equal(dispatches,0);

// Changes to facts on the same SKU require a complete rebuild, not a stale send.
for(const change of [p=>({...p,priceGBP:9.99}),p=>({...p,detailEvidence:{sourceContentHash:'d'.repeat(64)}})]){
 const changed=initial(),original=(await dailyDigestPlans(changed,{now:early,prepareAhead:true})).plans[0];
 await deliverDailyDigest(changed,{body:{id:original.id,revision},send,origin:'https://fixture.invalid',fetcher:reader(publication(original)),now:early});
 await changed.put('event/12345',change(structuredClone(product)));
 assert.equal((await deliverPreparedDigests({storage:changed,now:seven,send,origin:'https://fixture.invalid',fetcher})).attempted,0);
 const current=(await dailyDigestPlans(changed,{now:seven})).plans[0];assert.notEqual(current.fingerprint,original.fingerprint);
 await assert.rejects(deliverDailyDigest(changed,{body:{id:original.id,revision,fingerprint:original.fingerprint},send,origin:'https://fixture.invalid',fetcher,now:seven}),/facts changed/);
 await assert.rejects(deliverDailyDigest(changed,{body:{id:current.id,revision},send,origin:'https://fixture.invalid',fetcher:reader(publication(original)),now:seven}),/facts changed/);
}
assert.equal(sends,1);

// A late/stale retailer still holds the entire prebuilt report.
const stale=initial(),stalePlan=(await dailyDigestPlans(stale,{now:early,prepareAhead:true})).plans[0];
await deliverDailyDigest(stale,{body:{id:stalePlan.id,revision},send,origin:'https://fixture.invalid',fetcher:reader(publication(stalePlan)),now:early});
await stale.put('monitor',{lastDiscoverySuccess:'2026-11-24T23:00:00Z'});assert.equal((await deliverPreparedDigests({storage:stale,now:seven,send,origin:'https://fixture.invalid',fetcher})).attempted,0);assert.equal(sends,1);

// Provider failures retain the same document/intent and have a bounded cadence.
const retry=initial(),retryPlan=(await dailyDigestPlans(retry,{now:early,prepareAhead:true})).plans[0],retryRead=reader(publication(retryPlan));
await deliverDailyDigest(retry,{body:{id:retryPlan.id,revision},send,origin:'https://fixture.invalid',fetcher:retryRead,now:early});
let providerFailures=0;const refused=async()=>{providerFailures++;throw Error('fixture provider temporarily unavailable');};
for(const minutes of [0,1,21,22,42,63])await deliverPreparedDigests({storage:retry,now:seven+minutes*60000,send:refused,origin:'https://fixture.invalid',fetcher:retryRead});
assert.equal(providerFailures,2,'An uncertain provider acknowledgement stops resends after the existing 25-minute safety window');assert.equal((await retry.get('daily-digest-prepared-status')).attempts,3);assert(await retry.get(preparedDigestKey(retryPlan.day,retryPlan.recipient)));assert(!await retry.get('digest-sent/2026-11-26/a'));
console.log('PASS: full native report prepares after 06:00, waits without sending before 07:00, sends from the independent Worker clock, preserves one daily receipt, rebuilds changed same-SKU facts, holds stale stores, and bounds uncertain delivery retries. No actual network or email.');
