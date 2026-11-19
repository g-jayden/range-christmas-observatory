if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Repository Actions identity required');
// Stop only the superseded website attempt while it is still in read-only checkout.
const oldRun='44527065620',base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY;
const auth={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
const jobs=await fetch(base+'/actions/runs/'+oldRun+'/jobs?filter=latest',{headers:auth}).then(r=>r.json());
if(jobs.jobs?.some(j=>j.status==='in_progress'&&j.steps?.some(s=>s.name==='Run actions/checkout@v7.0.1'&&s.status==='in_progress'))){const r=await fetch(base+'/actions/runs/'+oldRun+'/cancel',{method:'POST',headers:auth});if(r.status!==202&&r.status!==409)throw Error('Stop obsolete read-only report checkout HTTP '+r.status);console.log(JSON.stringify({obsoleteCheckoutStopped:oldRun,status:r.status,sourceRequests:0,firecrawlCredits:0}));}
for(const[workflow,inputs]of [['jl.yml',{rebuildOnly:true}]]){
 const r=await fetch('https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/actions/workflows/'+workflow+'/dispatches',{method:'POST',headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json','content-type':'application/json'},body:JSON.stringify({ref:'main',inputs}),signal:AbortSignal.timeout(20000)});if(r.status!==204)throw Error('Approved acceptance dispatch '+workflow+' HTTP '+r.status);console.log(JSON.stringify({requested:workflow,status:r.status,sourceRequestsInThisLauncher:0,firecrawlCreditsInThisLauncher:0}));
}
