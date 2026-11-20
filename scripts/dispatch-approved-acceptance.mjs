if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Repository Actions identity required');
const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY,auth={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
async function get(path){const r=await fetch(base+path,{headers:auth,cache:'no-store'});if(!r.ok)throw Error('Recovery metadata HTTP '+r.status);return r.json();}
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{...auth,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(![202,204,409].includes(r.status))throw Error('Recovery request HTTP '+r.status);return r.status;}
const replaced=[];
for(const id of[44648313643,44649093525,44650002650,44652918474]){const run=await get('/actions/runs/'+id);if(run.path!=='.github/workflows/daily-pages.yml'||run.event!=='workflow_dispatch'||!['pending','queued'].includes(run.status))continue;const jobs=await get('/actions/runs/'+id+'/jobs');if(jobs.jobs.some(j=>j.status==='in_progress'||j.steps?.some(s=>s.status==='in_progress'||s.status==='completed')))continue;if(await post('/actions/runs/'+id+'/cancel')===202)replaced.push(id);}
const dispatched=await post('/actions/workflows/daily-pages.yml/dispatches',{ref:'main',inputs:{refresh:false,mode:'verify-all',checkNew:true,runner:'ubuntu-latest',browser:'firecrawl-browser'}});
console.log(JSON.stringify({coalescedUnstartedRuns:replaced,currentRangeAndAsdaCheckRequested:dispatched===204,ordinaryMonthlyLimitUnchanged:2000,sourceRequestsMade:false,firecrawlCredits:0,mailSent:false}));
await new Promise(resolve=>setTimeout(resolve,5000));
const recent=await get('/actions/runs?per_page=15');console.log(JSON.stringify({runs:recent.workflow_runs.map(r=>({id:r.id,path:r.path,event:r.event,status:r.status,sha:r.head_sha,createdAt:r.created_at})),sourceRequestsMade:false,firecrawlCredits:0}));
