import {readLedger,runKey} from '../server/credit-budget.mjs';import {atomicJson} from '../server/sync.mjs';
const ledger=await readLedger();let changed=false;
for(const period of Object.values(ledger.periods||{}))for(const [key,reservation]of Object.entries(period.reservations||{})){
 if(key===runKey()||!/^[0-9]+-[0-9]+$/.test(key))continue;
 const [id,attempt]=key.split('-');const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY;
 try{const run=await fetch(base+'/actions/runs/'+id+'/attempts/'+attempt).then(r=>r.json());if(run.status!=='completed'||run.conclusion!=='failure')continue;
 const jobs=await fetch(base+'/actions/runs/'+id+'/attempts/'+attempt+'/jobs').then(r=>r.json());const steps=jobs.jobs?.flatMap(j=>j.steps)||[];
 const paid=steps.filter(s=>/^(Collect official source|Repair remaining SKU|Prove the complete source)/.test(s.name));
 if(paid.length<3||paid.some(s=>s.conclusion!=='skipped'))continue;
 delete period.reservations[key];period.runs||=[];period.runs.push({key,credits:0,completedAt:new Date().toISOString(),receipt:{billingVerified:true,noPaidSourceStepStarted:true,githubRun:id,githubAttempt:attempt}});changed=true;console.log(JSON.stringify({releasedUnusedReservation:key,sourceRequestsMade:false}));
 }catch{ /* Retain the reservation when the audit cannot be proved. */ }
}
if(changed)await atomicJson('web/collection-ledger.json',ledger);
