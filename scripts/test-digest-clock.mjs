import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';import {dispatchDigestDue} from '../cloud/digest-clock.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
class DB{constructor(rows=[]){this.m=new Map(rows)}async get(k){return this.m.get(k)}async put(k,v){this.m.set(k,v)}async list({prefix}){return new Map([...this.m].filter(([k])=>k.startsWith(prefix)))}async transaction(fn){return fn(this)}}
const now=Date.parse('2026-11-19T00:00:00Z'),env={DAILY_PDF_DIGEST:'true',GITHUB_DISPATCH_TOKEN:'test-only'},db=new DB([['sub/a',{confirmedAt:'2026-11-17',scopes:['tree']}],['monitor',{lastDiscoverySuccess:'2026-11-18T23:15:00Z'}],['pending/1',{sku:'1',kind:'tree',department:'tree',departmentIds:['tree'],detectedAt:'2026-11-18T23:16:00Z',sourceUrl:'https://www.therange.co.uk/test'}]]);let calls=0;
const fetcher=async(url,init)=>{calls++;assert(url.endsWith('/daily-digest.yml/dispatches'));assert.deepEqual(JSON.parse(init.body),{ref:'main',inputs:{testOwner:false}});return new Response(null,{status:204})};
assert((await dispatchDigestDue({storage:db,env,now,fetcher})).dispatched);assert((await dispatchDigestDue({storage:db,env,now:now+1000,fetcher})).bounded);
for(const minutes of [21,42])assert((await dispatchDigestDue({storage:db,env,now:now+minutes*60000,fetcher})).dispatched);
assert((await dispatchDigestDue({storage:db,env,now:now+63*60000,fetcher})).bounded);assert.equal(calls,3);
await db.put('delivered/1/a',{accepted:true});assert.equal((await dispatchDigestDue({storage:db,env,now:now+64*60000,fetcher})).due,false);assert.equal(calls,3);
const stale=new DB([['sub/a',{confirmedAt:'2026-11-17',scopes:['tree']}],['pending/1',await db.get('pending/1')]]);assert.equal((await dispatchDigestDue({storage:stale,env,now,fetcher})).due,false);assert.equal(calls,3);
console.log('PASS: independent PDF trigger only for verified unsent contents, three attempts per unchanged batch, no 5-minute retry loop, and no empty/stale report jobs.');
const {readFile}=await import('node:fs/promises');const workflow=await readFile('.github/workflows/daily-digest.yml','utf8');assert.match(workflow,/group: consolidated-christmas-new-pdf\n  cancel-in-progress: false/);assert(!/^\s+queue: max\s*$/m.test(workflow),'Source completion events must coalesce into one waiting latest-outbox refresh, without cancelling an active delivery');
