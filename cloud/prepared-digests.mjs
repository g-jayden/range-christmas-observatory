import {dailyDigestPlans,deliverDailyDigest,preparedDigestKey} from './daily-digest.mjs';

// The Worker owns the 07:00 send. GitHub only prepares the pinned, verified PDF;
// its queue latency must not delay a document that is already ready.
export async function deliverPreparedDigests({storage,now=Date.now(),send,origin,fetcher=fetch}={}){
 const base={accepted:0,attempted:0,firecrawlCredits:0,sourceRequestsMade:false};
 if(new Date(now+28800000).getUTCHours()<7||typeof send!=='function')return base;
 const queue=await dailyDigestPlans(storage,{now,maxPlans:10}),failures=[];
 for(const plan of queue.plans){
  const ready=await storage.get(preparedDigestKey(plan.day,plan.recipient));
  if(!ready||ready.id!==plan.id||ready.fingerprint!==plan.fingerprint)continue;
  const attemptKey='digest-prepared-clock/'+plan.day+'/'+plan.recipient,key=ready.fingerprint+'/'+ready.pdfSha256;let claim;
  await storage.transaction(async tx=>{const previous=await tx.get(attemptKey);if(previous?.key===key&&(previous.attempts>=3||now-Date.parse(previous.lastAttemptAt)<20*60000))return;claim={key,attempts:previous?.key===key?previous.attempts+1:1,lastAttemptAt:new Date(now).toISOString()};await tx.put(attemptKey,claim);});
  if(!claim)continue;
  base.attempted++;
  try{
   const result=await deliverDailyDigest(storage,{body:{id:ready.id,revision:ready.revision,fingerprint:ready.fingerprint},send,origin,fetcher,now});
   if(!result.accepted||result.scheduled)throw Error('The prepared report was not acknowledged');
   base.accepted++;if(storage.delete)await storage.delete(preparedDigestKey(plan.day,plan.recipient));
   await storage.put('daily-digest-prepared-status',{day:plan.day,preparedAt:ready.preparedAt,checkedAt:new Date(now).toISOString(),products:result.products,state:'provider-accepted-complete-daily-report'});
  }catch(e){
   const error=String(e.message||e).slice(0,240);failures.push({planId:plan.id,error});
   await storage.put('daily-digest-prepared-status',{day:plan.day,preparedAt:ready.preparedAt,checkedAt:new Date(now).toISOString(),products:ready.products,state:'prepared-report-delivery-pending',attempts:claim.attempts,error});
  }
 }
 return {...base,failures};
}
