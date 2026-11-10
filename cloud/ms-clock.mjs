export async function dispatchMsDue({storage,env,now=Date.now(),fetcher=fetch}){
 const base={firecrawlCredits:0,sourceRequestsMade:false,mailSent:false};if(!env.GITHUB_DISPATCH_TOKEN||!await storage.get('baseline/ms-christmas-v1'))return {...base,enabled:false};
 const shifted=new Date(now+28800000),day=shifted.toISOString().slice(0,10);if(shifted.getUTCHours()<7)return {...base,enabled:true,due:false};
 const status=await storage.get('ms-monitor');if(Date.parse(status?.observedAt)>=Date.parse(day+'T07:00:00+08:00'))return {...base,enabled:true,due:false};
 let claim;await storage.transaction(async db=>{const p=await db.get('ms-clock');if(p?.day===day&&(p.attempts>=3||p.pendingUntil>now||now-Date.parse(p.lastAttemptAt)<15*60000))return;claim={day,attempts:p?.day===day?p.attempts+1:1,lastAttemptAt:new Date(now).toISOString(),pendingUntil:now+120000};await db.put('ms-clock',claim);});
 if(!claim)return {...base,enabled:true,due:true,bounded:true};let statusCode=0;
 try{const r=await fetcher('https://api.github.com/repos/g-jayden/range-christmas-observatory/actions/workflows/ms.yml/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'range-christmas-scheduler','x-github-api-version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{mode:'daily'}}),signal:AbortSignal.timeout(20000)});statusCode=r.status;}catch{}
 await storage.put('ms-clock',{...claim,pendingUntil:0,lastStatus:statusCode});return {...base,enabled:true,due:true,dispatched:statusCode===204,status:statusCode,attempts:claim.attempts};
}
