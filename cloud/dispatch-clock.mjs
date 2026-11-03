const ENDPOINT='https://api.github.com/repos/g-jayden/range-christmas-observatory/actions/workflows/daily-pages.yml/dispatches';
const MAX_ATTEMPTS=3,RECHECK_MS=15*60000;

// Cloudflare is the clock; the existing workflow remains the only collector.
// This function never opens Firecrawl, sends email or modifies the NEW baseline.
export async function dispatchDue({storage,env,config,monitor,fullLease,monitorLease,initialized,now=Date.now(),fetcher=fetch}){
 const base={sourceRequestsMade:false,firecrawlCredits:0,mailSent:false};
 if(!env.GITHUB_DISPATCH_TOKEN)return {...base,enabled:false,reason:'repository-dispatch-credential-required'};
 const due=[];
 if(now>=Date.parse(config.nextRunAt)&&!(fullLease?.expires>now))due.push('full:'+config.nextRunAt);
 if(initialized&&env.BREVO_API_KEY&&env.MAIL_FROM&&now>=Date.parse(monitor.nextRunAt)&&!(monitorLease?.expires>now))due.push('new:'+monitor.nextRunAt);
 if(!due.length)return {...base,enabled:true,due:false};
 const key=due.join('|');let claim;
 await storage.transaction(async db=>{
  const previous=await db.get('dispatch-clock'),same=previous?.key===key;
  if(same&&(previous.pendingUntil>now||previous.attempts>=MAX_ATTEMPTS||previous.lastAcceptedAt&&now-Date.parse(previous.lastAcceptedAt)<RECHECK_MS))return;
  claim={key,attempts:same?previous.attempts+1:1,pendingUntil:now+120000,lastAttemptAt:new Date(now).toISOString(),lastAcceptedAt:same?previous.lastAcceptedAt:null};
  await db.put('dispatch-clock',claim);
 });
 if(!claim)return {...base,enabled:true,due:true,dispatched:false,bounded:true};
 let status=0,error;
 try{
  const response=await fetcher(ENDPOINT,{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'range-christmas-scheduler','x-github-api-version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{refresh:false,mode:'verify-all',checkNew:false,runner:'ubuntu-latest',browser:'firecrawl-browser'}}),signal:AbortSignal.timeout(20000)});
  status=response.status;if(status!==204)error='GitHub dispatch HTTP '+status;
 }catch{error='GitHub dispatch request unavailable';}
 const result={...claim,pendingUntil:0,lastStatus:status,lastAcceptedAt:status===204?new Date(now).toISOString():claim.lastAcceptedAt,lastError:error||null};
 await storage.put('dispatch-clock',result);
 return {...base,enabled:true,due:true,dispatched:status===204,attempts:result.attempts,status,error:error||null};
}
