export function nextDailyPolicy(grant){
 if(grant?.retailerId!=='nx'||grant.enabled!==true||grant.scheduledPaidCollection!==true||grant.scope!=='ongoing-five-category-collection')throw Error('Ongoing Next-only paid fallback is not authorised');
 if(!Number.isInteger(grant.maxCreditsPerRun)||grant.maxCreditsPerRun<5||grant.maxCreditsPerRun>60||!Number.isInteger(grant.accountReserveCredits)||grant.accountReserveCredits<5000)throw Error('Next operational credit guard is invalid');
 return {retailerId:'nx',authorizationId:grant.id,maxCreditsPerRun:grant.maxCreditsPerRun,accountReserveCredits:grant.accountReserveCredits,freeFirst:true,monthlyLimit:null,maxPaidAttemptsPerRequest:1};
}
export function nextPaidRequestAllowed(policy,{spent=0,accountRemaining,reservation=5}={}){if(!Number.isFinite(accountRemaining)||accountRemaining-policy.accountReserveCredits<reservation||spent+reservation>policy.maxCreditsPerRun)throw Error('Next run credit bound or account reserve reached');return true;}
export function nextBeijingDay(now=Date.now()){return new Date(now+28800000).toISOString().slice(0,10);}
export function nextRunCompleteToday(status,now=Date.now()){const day=nextBeijingDay(now);return status?.automaticArrivalChecks===true&&status?.collectionComplete===true&&Date.parse(status.lastCompleteAt)>=Date.parse(day+'T07:00:00+08:00');}
// A paid response can only satisfy the same exact request and recent source scan.
export function nextReusableCheckpoint(checkpoint,now=Date.now()){return checkpoint?.day===nextBeijingDay(now)&&Number.isFinite(Date.parse(checkpoint.startedAt))&&now-Date.parse(checkpoint.startedAt)>=0&&now-Date.parse(checkpoint.startedAt)<30*60000;}
