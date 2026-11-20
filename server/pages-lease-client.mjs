const ROUTES=new Set(['/internal/pages-publication-lease','/internal/data-publication-lease']);
export async function withPagesPublicationLease(action,{env=process.env,fetcher=fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),log=v=>console.log(JSON.stringify(v)),maxWaitMs=1800000,route='/internal/pages-publication-lease'}={}){
 if(!ROUTES.has(route)||!(maxWaitMs>0&&maxWaitMs<=1800000))throw Error('Invalid publication lease request');
 const base=(env.CONTROL_API_URL||'').replace(/\/$/,''),owner=env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT,label=route.includes('/data-')?'data':'pages';
 if(base!=='https://range-christmas-control.1148522155.workers.dev'||!env.CONTROL_TOKEN||!/^\d{1,20}-\d{1,6}$/.test(owner))throw Error('Publication requires its existing private control lease');
 const request=async operation=>{const r=await fetcher(base+route,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+env.CONTROL_TOKEN,'content-type':'application/json'},body:JSON.stringify({operation,owner}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Publication lease HTTP '+r.status);return r.json();};
 let expiresAt=0,busy=false,closed=false,interval;const started=now();
 try{
  while(now()-started<maxWaitMs){const r=await request('acquire');if(r.acquired){expiresAt=r.expiresAt;break;}log({phase:label+'-publication-waiting-for-existing-publication',elapsedSeconds:Math.round((now()-started)/1000),position:r.position,sourceRequests:0,firecrawlCredits:0});await sleep(Math.max(1,Math.min(r.retryAfterMs||5000,15000,maxWaitMs-(now()-started))));}
  if(!expiresAt)throw Error('Publication lease exceeded bounded wait; artifact remains saved');
  interval=setInterval(async()=>{if(busy||closed)return;busy=true;try{const r=await request('renew');expiresAt=r.acquired?r.expiresAt:0;}catch{}finally{busy=false;}},30000);
  const assertLease=()=>{if(now()>=expiresAt)throw Error('Publication lease expired; overlapping publication refused');};
  return await action(assertLease);
 }finally{closed=true;clearInterval(interval);try{await request('release');}catch{log({phase:label+'-publication-lease-release-pending-expiry',sourceRequests:0,firecrawlCredits:0});}}
}
export const withDataPublicationLease=(action,options={})=>withPagesPublicationLease(action,{...options,maxWaitMs:options.maxWaitMs??600000,route:'/internal/data-publication-lease'});
