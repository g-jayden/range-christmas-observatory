import{endedMonitorOwner,githubRunReader}from'./monitor-owner.mjs';
// Reuse the exact GitHub run/step ownership proof used for daily checks. A
// skipped source step or terminated runner must not hold the weekly lane for
// seven hours. Releasing an ended claim never advances a source timestamp.
export async function recoverAbandonedFull({storage,env,fetcher=fetch,now=Date.now(),get}={}){
 const prior=await storage.get('lease/full');if(!prior)return{released:false};
 const normalized={...prior,createdAt:prior.createdAt??prior.expires-7*3600000};let owner;const checks=[],reader=get||githubRunReader(env,fetcher),checkedGet=async path=>{const data=await reader(path);if(Array.isArray(data.workflow_runs))checks.push({kind:'runs',rows:data.workflow_runs.slice(0,5).map(r=>({id:r.id,status:r.status,path:r.path,startedAt:r.run_started_at,updatedAt:r.updated_at}))});else if(Array.isArray(data.jobs))checks.push({kind:'tick-steps',steps:data.jobs.flatMap(j=>j.steps||[]).filter(s=>s.name==='Check the configured full and NEW schedules').map(s=>({status:s.status,conclusion:s.conclusion,startedAt:s.started_at,completedAt:s.completed_at}))});else checks.push({kind:'run',id:data.id,status:data.status,path:data.path});return data;};
 try{owner=await endedMonitorOwner(normalized,checkedGet,{now});}catch(e){await storage.put('full-owner-recovery',{state:'verification-pending',checkedAt:new Date(now).toISOString(),reason:String(e.message).replace(/Bearer[^ ]+/g,'[redacted]').slice(0,120)});return{released:false,verificationPending:true};}
 if(!owner){await storage.put('full-owner-recovery',{state:'retained-active-or-unconfirmed',checkedAt:new Date(now).toISOString(),claimCreatedAt:normalized.createdAt,checks});return{released:false};}let released=false;
 await storage.transaction(async db=>{const current=await db.get('lease/full');if(current?.lease!==prior.lease)return;await db.delete('lease/full');await db.put('full-owner-recovery',{runId:owner.runId,recoveredAt:new Date(now).toISOString(),legacyOwnerVerified:Boolean(owner.legacyOwnerVerified),sourceFreshnessChanged:false});released=true;});
 return{released,runId:owner.runId,sourceRequestsMade:false,firecrawlCredits:0};
}

export async function fullRefreshState(storage){const lease=await storage.get('lease/full'),at=lease&&(lease.createdAt??lease.expires-7*3600000);return{claimed:Boolean(lease),ownerRunId:lease?.ownerRunId||null,claimedAt:Number.isFinite(at)?new Date(at).toISOString():null,expiresAt:Number.isFinite(lease?.expires)?new Date(lease.expires).toISOString():null,recovery:await storage.get('full-owner-recovery')||null};}
