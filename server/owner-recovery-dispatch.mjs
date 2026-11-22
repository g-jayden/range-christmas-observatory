const REPO='g-jayden/range-christmas-observatory';
export async function dispatchOwnerRecovery(request,{env=process.env,fetcher=fetch,now=Date.now()}={}){
 if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_REF!=='refs/heads/main'||!env.GITHUB_TOKEN)throw Error('Owner recovery requires the main-branch repository action');
 const at=Date.parse(request?.requestedAt);if(request?.authorization!=='owner-standing-complete-unfinished-collection'||!/^owner-recovery-2026112[23]-[a-z0-9-]+$/.test(request.requestId)||!Number.isFinite(at)||at>now+60000||now-at>3600000||!Array.isArray(request.targets)||!request.targets.length||request.targets.length>2||new Set(request.targets).size!==request.targets.length)throw Error('Invalid or stale owner recovery request');
 const approved={'bm-current':{workflow:'bm.yml',inputs:{mode:'daily'}},'range-new-current':{workflow:'daily-pages.yml',inputs:{refresh:false,mode:'verify-all',checkNew:true,runner:'ubuntu-latest',browser:'firecrawl-browser'}}};
 if(request.targets.some(id=>!approved[id]))throw Error('Unsupported recovery target');const results=[];
 for(const target of request.targets){const{workflow,inputs}=approved[target],r=await fetcher('https://api.github.com/repos/'+REPO+'/actions/workflows/'+workflow+'/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','content-type':'application/json'},body:JSON.stringify({ref:'main',inputs}),signal:AbortSignal.timeout(20000)});if(r.status!==204)throw Error('Owner recovery dispatch HTTP '+r.status);results.push({target,workflow,accepted:true});}
 return{requestId:request.requestId,results,sourceRequests:0,firecrawlCredits:0,mailSent:false};
}
