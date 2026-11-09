const REPO='g-jayden/range-christmas-observatory';
const owns=(run,at)=>run.status==='completed'&&run.head_branch==='main'&&run.path==='.github/workflows/daily-pages.yml'&&Date.parse(run.run_started_at)<=at&&Date.parse(run.updated_at)>=at;
// An ended GitHub run is independently verified before its private lease is
// released. An active run, ambiguous legacy owner or API failure stays protected.
export async function endedMonitorOwner(lease,get,{now=Date.now()}={}){
 if(!lease)return null;const at=lease.createdAt||lease.expires-100*60000;
 if(!Number.isFinite(at)||now-at<120000||now-at>86400000)return null;
 if(/^\d+$/.test(String(lease.ownerRunId||''))){const run=await get('/actions/runs/'+lease.ownerRunId);return String(run.id)===String(lease.ownerRunId)&&owns(run,at)?{runId:run.id}:null;}
 const runs=(await get('/actions/workflows/daily-pages.yml/runs?per_page=25')).workflow_runs||[],candidates=runs.filter(r=>owns(r,at));
 if(candidates.length>3)return null;const found=[];
 for(const run of candidates.slice(0,3)){
  const jobs=(await get('/actions/runs/'+run.id+'/jobs')).jobs||[];
  if(jobs.some(j=>j.steps?.some(s=>s.name==='Check the configured full and NEW schedules'&&s.conclusion==='success'&&Date.parse(s.started_at)<=at&&Date.parse(s.completed_at)>=at)))found.push(run);
 }
 return found.length===1?{runId:found[0].id,legacyOwnerVerified:true}:null;
}
export function githubRunReader(env,fetcher=fetch){
 return async path=>{if(!env.GITHUB_DISPATCH_TOKEN)throw Error('Dispatch credential unavailable');
  const r=await fetcher('https://api.github.com/repos/'+REPO+path,{headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,accept:'application/vnd.github+json','user-agent':'range-christmas-scheduler','x-github-api-version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('GitHub run verification HTTP '+r.status);return r.json();};
}
