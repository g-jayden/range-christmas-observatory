const KEY='approved-native-recovery-20261120-v1';
const jobs=[['asda.yml',{rebuildOnly:true}],['bq.yml',{rebuildOnly:true,notificationsOnly:true}],['range-native.yml',{imageRole:'listing-previews',continuationDepth:'0'}],['daily-digest.yml',{testOwner:false,repairCombined:false}]];
// One owner-authorised recovery batch. Its fixed task identity is claimed
// before any network call; subsequent clock ticks cannot dispatch it again.
export async function dispatchApprovedNativeRecovery({storage,env,fetcher=fetch,now=Date.now()}={}){
 if(!env.GITHUB_DISPATCH_TOKEN||env.APPROVED_NATIVE_RECOVERY!=='owner-native-20261120-v1')return{enabled:false};let claim,existing;
 await storage.transaction(async db=>{existing=await db.get(KEY);if(existing)return;if(now>Date.parse('2026-11-21T00:00:00Z'))return;claim={id:KEY,state:'dispatching',startedAt:new Date(now).toISOString(),results:[]};await db.put(KEY,claim);});
 if(!claim)return{enabled:true,alreadyClaimed:Boolean(existing),state:existing?.state||'expired'};
 for(const[workflow,inputs]of jobs){let status=0;try{const r=await fetcher('https://api.github.com/repos/g-jayden/range-christmas-observatory/actions/workflows/'+workflow+'/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'range-christmas-owner-recovery'},body:JSON.stringify({ref:'main',inputs}),signal:AbortSignal.timeout(20000)});status=r.status;}catch{}claim.results.push({workflow,status,accepted:status===204});await storage.put(KEY,{...claim,results:[...claim.results]});}
 claim.state=claim.results.every(r=>r.accepted)?'dispatched':'dispatch-outcome-needs-review';await storage.put(KEY,claim);return{...claim,sourceRequests:0,firecrawlCredits:0,mailSent:false};
}
