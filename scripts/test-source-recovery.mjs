import assert from 'node:assert/strict';
import {sourceRecovery,sourceRetryDue,retryableSourceError} from '../cloud/source-recovery.mjs';
import {dispatchDue} from '../cloud/dispatch-clock.mjs';
import {advanceNewCheck} from '../server/schedule.mjs';
import {monitorLabel} from '../web/monitor-labels.mjs';
const now=Date.parse('2026-11-08T23:01:00Z');let state={nextRunAt:'2026-11-09T23:00:00Z'};
state={...state,...sourceRecovery(state,{success:false,retryable:true,now})};
assert.equal(state.sourceAttempts,1);assert.equal(state.sourceRetryAt,'2026-11-08T23:16:00.000Z');
assert.equal(sourceRetryDue(state,now),false);assert.equal(sourceRetryDue(state,now+15*60000),true);
assert(monitorLabel({...state,state:'error'}).includes('自动恢复'));
class Store{constructor(){this.m=new Map()}async get(k){return structuredClone(this.m.get(k))}async put(k,v){this.m.set(k,structuredClone(v))}async transaction(fn){return fn(this)}}
let calls=0;const storage=new Store,env={GITHUB_DISPATCH_TOKEN:'test',BREVO_API_KEY:'test',MAIL_FROM:'test@example.invalid'};
const tick=at=>dispatchDue({storage,env,initialized:true,now:at,config:{nextRunAt:'2026-11-19T23:00:00Z'},monitor:state,fetcher:async()=>{calls++;return new Response(null,{status:204})}});
assert.equal((await tick(now)).due,false);assert.equal((await tick(now+15*60000)).dispatched,true);
assert.equal((await tick(now+16*60000)).bounded,true);assert.equal(calls,1);
state={...state,...sourceRecovery(state,{success:false,retryable:true,now:now+16*60000})};assert.equal(state.sourceAttempts,2);assert.equal(state.sourceRetryAt,'2026-11-09T00:02:00.000Z');
state={...state,...sourceRecovery(state,{success:false,retryable:true,now:now+62*60000})};assert.equal(state.sourceAttempts,3);assert.equal(state.sourceRetryAt,null);assert.equal(state.sourceRetryExhausted,true);assert.equal(sourceRetryDue(state,now+90*60000),false);
state={...state,...sourceRecovery(state,{success:true,now:now+120*60000})};assert.equal(state.sourceRetryExhausted,false);assert.equal(state.sourceAttempts,0);assert.equal(state.sourceRetryAt,null);
assert.equal(advanceNewCheck(state.nextRunAt,new Date(now+120*60000)),state.nextRunAt.replace('00Z','00.000Z'),'Recovery must preserve tomorrow’s 07:00 slot');
for(const status of [400,401,402,404,422])assert.equal(retryableSourceError({status,message:'fetch failed'}),false);
for(const status of [0,403,408,429,500,502,503,504])assert.equal(retryableSourceError({status}),true);
assert.equal(retryableSourceError(Error('net::ERR_QUIC_PROTOCOL_ERROR')),true);
assert.equal(retryableSourceError(Error('SKU membership mismatch')),false);
assert.equal(sourceRecovery({}, {success:false,retryable:false,now}).sourceRetryAt,null);
assert.equal(sourceRecovery({}, {success:false,retryable:true,now:Date.parse('2026-11-09T15:59:00Z')}).sourceRetryAt,null,'A recovery cannot leak into the next Beijing day');
console.log('PASS: bounded same-day source recovery, independent clock, budget/permanent-failure isolation and success reset');

const {endedMonitorOwner}=await import('../cloud/monitor-owner.mjs');
const lease={lease:'private-test',createdAt:now,ownerRunId:'123',expires:now+100*60000};
const ended={id:123,status:'completed',head_branch:'main',path:'.github/workflows/daily-pages.yml',run_started_at:new Date(now-60000).toISOString(),updated_at:new Date(now+60000).toISOString()};
assert.equal((await endedMonitorOwner(lease,async()=>ended,{now:now+180000})).runId,123);
assert.equal(await endedMonitorOwner(lease,async()=>({...ended,status:'in_progress'}),{now:now+180000}),null,'An active collector lease must never be stolen');
assert.equal(await endedMonitorOwner(lease,async()=>({...ended,id:456}),{now:now+180000}),null);
const legacy={lease:'private-legacy',expires:now+100*60000};
const matching={jobs:[{steps:[{name:'Check the configured full and NEW schedules',conclusion:'success',started_at:new Date(now-1000).toISOString(),completed_at:new Date(now+1000).toISOString()}]}]};
assert.equal((await endedMonitorOwner(legacy,async path=>path.includes('?per_page')?{workflow_runs:[ended]}:matching,{now:now+180000})).runId,123);
assert.equal(await endedMonitorOwner(legacy,async path=>path.includes('?per_page')?{workflow_runs:[ended]}:{jobs:[]},{now:now+180000}),null,'A legacy claim requires exact schedule-step timing evidence');
assert.equal(await endedMonitorOwner(legacy,async path=>path.includes('?per_page')?{workflow_runs:[ended,{...ended,id:456}]}:matching,{now:now+180000}),null,'Ambiguous ownership must remain protected');
await assert.rejects(endedMonitorOwner(lease,async()=>{throw Error('GitHub unavailable')},{now:now+180000}),/unavailable/);
const workflow=await (await import('node:fs/promises')).readFile('.github/workflows/daily-pages.yml','utf8');assert.match(workflow,/if: always\(\) && steps\.tick\.outputs\.monitor == 'true'\s+run: node scripts\/release-unused-monitor\.mjs/);
console.log('PASS: ended-run ownership verification, active/ambiguous lease protection and unconditional owned-claim cleanup');

const roundedJob={jobs:[{steps:[{...matching.jobs[0].steps[0],completed_at:new Date(now).toISOString().replace('.000Z','Z')}]}]};
assert.equal((await endedMonitorOwner({...legacy,expires:legacy.expires+436},async path=>path.includes('?per_page')?{workflow_runs:[ended]}:roundedJob,{now:now+180000})).runId,123,'GitHub second-resolution step timestamps must include their complete final second');

const fsCredit=await import('node:fs/promises'),osCredit=await import('node:os'),pathCredit=await import('node:path');
const creditDir=await fsCredit.mkdtemp(pathCredit.join(osCredit.tmpdir(),'range-unused-budget-')),creditCwd=process.cwd(),creditFetch=globalThis.fetch,creditEnv={GITHUB_REPOSITORY:process.env.GITHUB_REPOSITORY,GITHUB_RUN_ID:process.env.GITHUB_RUN_ID};
try{
 process.chdir(creditDir);process.env.GITHUB_REPOSITORY='fixture/project';process.env.GITHUB_RUN_ID='20';await fsCredit.mkdir('web');
 await fsCredit.writeFile('web/collection-ledger.json',JSON.stringify({periods:{'2026-11':{used:0,reservations:{'10-1':{amount:10}}}}}));
 let probeSkipped=false;
 globalThis.fetch=async url=>{assert(url.startsWith('https://api.github.com/repos/fixture/project/'));return Response.json(url.endsWith('/jobs')?{jobs:[{steps:[...['Collect official source','Repair remaining SKU','Prove the complete source'].map(name=>({name,conclusion:'skipped'})),{name:'Prove batched catalogue transport with one bounded request',conclusion:probeSkipped?'skipped':'success'}]}]}:{status:'completed',conclusion:'failure'})};
 await import('../scripts/release-unused-reservations.mjs?billed-probe-test');
 assert((JSON.parse(await fsCredit.readFile('web/collection-ledger.json'))).periods['2026-11'].reservations['10-1'],'An executed catalogue probe cannot be refunded as zero-cost preflight');
 probeSkipped=true;await import('../scripts/release-unused-reservations.mjs?skipped-probe-test');
 assert.equal((JSON.parse(await fsCredit.readFile('web/collection-ledger.json'))).periods['2026-11'].reservations['10-1'],undefined);
 console.log('PASS: executed probes keep their billing reservation; source steps proven skipped release zero-cost preflight reservations');
}finally{process.chdir(creditCwd);globalThis.fetch=creditFetch;for(const[k,v]of Object.entries(creditEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await fsCredit.rm(creditDir,{recursive:true,force:true});}
