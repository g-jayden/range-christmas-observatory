// Retire only a verified post-commit legacy build that occupies the source queue.
if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Repository Actions identity required');
const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY,headers={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
async function get(p){const r=await fetch(base+p,{headers});if(!r.ok)throw Error('Legacy build verification HTTP '+r.status);return r.json();}
const id=44660129065,run=await get('/actions/runs/'+id),jobs=await get('/actions/runs/'+id+'/jobs'),job=jobs.jobs.find(j=>j.name==='website');
if(run.path!=='.github/workflows/daily-pages.yml'||run.status!=='in_progress'||!job)throw Error('Legacy post-commit source build is no longer active');
for(const name of ['Preserve data and source status','Send verified NEW emails from committed, accessible native attachments'])if(!job.steps.some(s=>s.name===name&&s.conclusion==='success'))throw Error('Cannot retire a source run before durable source and billing publication');
if(!job.steps.some(s=>s.name==='Build site'&&s.status==='in_progress')||job.steps.some(s=>s.status==='in_progress'&&s.name!=='Build site'))throw Error('Source or paid work remains active; no cancellation');
const pubs=await get('/actions/runs?per_page=40');if(!pubs.workflow_runs.some(r=>r.path==='.github/workflows/static-pages.yml'&&['pending','queued','in_progress'].includes(r.status)))throw Error('Independent source-free publisher must already exist');
const response=await fetch(base+'/actions/runs/'+id+'/cancel',{method:'POST',headers});if(response.status!==202)throw Error('Legacy post-commit build retirement HTTP '+response.status);
console.log(JSON.stringify({retiredLegacyPostCommitBuild:id,sourceAndBillingAlreadyDurable:true,independentPublisherRetained:true,paidSourceWorkCancelled:false,sourceRequestsMade:false,firecrawlCredits:0,mailSent:false}));
