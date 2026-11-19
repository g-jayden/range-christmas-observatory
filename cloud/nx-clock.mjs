// The independent clock only dispatches the existing repository; it never crawls
// or sends email. GitHub's shared FIFO group prevents overlapping paid workers.
export async function dispatchNxDue({storage,env,now=Date.now(),fetcher=fetch,productionQueue}){
 const base={firecrawlCredits:0,sourceRequestsMade:false,mailSent:false};if(!env.GITHUB_DISPATCH_TOKEN||!await storage.get('baseline/nx-christmas-v1'))return {...base,enabled:false};
 if(productionQueue&&(productionQueue.reason==='production-queue-unavailable'||productionQueue.reason==='repository-dispatch-credential-required'||productionQueue.independentActive?.some(r=>String(r.path||'').split('@')[0]==='.github/workflows/nx.yml')))return {...base,enabled:true,waiting:true,sameRetailerBusy:true};
 const shifted=new Date(now+28800000),day=shifted.toISOString().slice(0,10);if(shifted.getUTCHours()<7)return {...base,enabled:true,due:false};
 const status=await storage.get('nx-monitor');if(status?.automaticArrivalChecks===true&&status.collectionComplete===true&&/^[a-f0-9]{40}$/.test(status.committedRevision||'')&&Date.parse(status.observedAt)>=Date.parse(day+'T07:00:00+08:00'))return {...base,enabled:true,due:false};
 let claim;await storage.transaction(async db=>{const p=await db.get('nx-clock');if(p?.day===day&&(p.attempts>=3||p.pendingUntil>now||now-Date.parse(p.lastAttemptAt)<20*60000))return;claim={day,attempts:p?.day===day?p.attempts+1:1,lastAttemptAt:new Date(now).toISOString(),pendingUntil:now+120000};await db.put('nx-clock',claim);});
 if(!claim)return {...base,enabled:true,due:true,bounded:true};let statusCode=0;
 try{const r=await fetcher('https://api.github.com/repos/g-jayden/range-christmas-observatory/actions/workflows/nx.yml/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'range-christmas-scheduler','x-github-api-version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{force:false}}),signal:AbortSignal.timeout(20000)});statusCode=r.status;}catch{}
 await storage.put('nx-clock',{...claim,pendingUntil:0,lastStatus:statusCode});return {...base,enabled:true,due:true,dispatched:statusCode===204,status:statusCode,attempts:claim.attempts};
}
