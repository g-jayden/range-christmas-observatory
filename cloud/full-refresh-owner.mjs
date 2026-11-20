import{endedMonitorOwner,githubRunReader}from'./monitor-owner.mjs';
// Reuse the exact GitHub run/step ownership proof used for daily checks. A
// skipped source step or terminated runner must not hold the weekly lane for
// seven hours. Releasing an ended claim never advances a source timestamp.
export async function recoverAbandonedFull({storage,env,fetcher=fetch,now=Date.now(),get}={}){
 const prior=await storage.get('lease/full');if(!prior)return{released:false};
 const normalized={...prior,createdAt:prior.createdAt??prior.expires-7*3600000};let owner;
 try{owner=await endedMonitorOwner(normalized,get||githubRunReader(env,fetcher),{now});}catch{return{released:false,verificationPending:true};}
 if(!owner)return{released:false};let released=false;
 await storage.transaction(async db=>{const current=await db.get('lease/full');if(current?.lease!==prior.lease)return;await db.delete('lease/full');await db.put('full-owner-recovery',{runId:owner.runId,recoveredAt:new Date(now).toISOString(),legacyOwnerVerified:Boolean(owner.legacyOwnerVerified),sourceFreshnessChanged:false});released=true;});
 return{released,runId:owner.runId,sourceRequestsMade:false,firecrawlCredits:0};
}
