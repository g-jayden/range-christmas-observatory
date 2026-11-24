// GitHub's shared production group must retain waiting retailers. The workflows
// use concurrency.queue=max; this read-only gate avoids adding retries while
// a collection or its publication is still running or waiting.
const INDEPENDENT=new Set(['.github/workflows/asda.yml','.github/workflows/ms.yml','.github/workflows/hb.yml','.github/workflows/du.yml','.github/workflows/nx.yml','.github/workflows/jl.yml','.github/workflows/ar.yml','.github/workflows/ar-images.yml','.github/workflows/mt.yml','.github/workflows/bq.yml','.github/workflows/bm.yml']);
const REPO='https://api.github.com/repos/g-jayden/range-christmas-observatory';
const WORKFLOWS=new Set(['jl.yml','ar.yml','ar-images.yml','daily-pages.yml','range-native.yml','asda.yml','ms.yml','bm.yml','hb.yml','du.yml','nx.yml','mt.yml','bq.yml','decorations-bootstrap.yml','probe-native-images.yml','apply-free-update.yml'].map(p=>'.github/workflows/'+p));
export async function productionQueueState({env,fetcher=fetch}){
 const base={sourceRequestsMade:false,firecrawlCredits:0,mailSent:false};if(!env.GITHUB_DISPATCH_TOKEN)return {...base,clear:false,reason:'repository-dispatch-credential-required'};
 try{const groups=await Promise.all(['in_progress','queued','pending','waiting','requested'].map(async status=>{
  const rows=[];let total=0;
  for(let page=1;page<=10;page++){
   const r=await fetcher(REPO+'/actions/runs?status='+status+'&per_page=100'+(page>1?'&page='+page:''),{headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,accept:'application/vnd.github+json','user-agent':'range-christmas-scheduler','x-github-api-version':'2022-11-28'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('GitHub queue HTTP '+r.status);const d=await r.json();if(!Array.isArray(d.workflow_runs)||!Number.isInteger(d.total_count))throw Error('GitHub queue invalid listing: '+status);total=d.total_count;rows.push(...d.workflow_runs);
   if(rows.length>=total)break;
   if(!d.workflow_runs.length||page===10)throw Error('GitHub queue listing incomplete: '+status+' total='+total+' received='+rows.length+' pages='+page);
  }
  return rows.filter(run=>WORKFLOWS.has(String(run.path||'').split('@')[0])).map(run=>({id:run.id,path:run.path,status:run.status}));
 }));const all=[...new Map(groups.flat().map(r=>[r.id,r])).values()],independentActive=all.filter(r=>INDEPENDENT.has(String(r.path).split('@')[0])),active=all.filter(r=>!INDEPENDENT.has(String(r.path).split('@')[0]));return {...base,clear:active.length===0,active,independentActive,reason:active.length?'production-workflow-running-or-waiting':null};
 }catch(e){return {...base,clear:false,reason:'production-queue-unavailable',error:String(e.message).slice(0,160)};}
}
