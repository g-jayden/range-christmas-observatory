if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Repository Actions identity required');
const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY,auth={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
// Start one read-only Pages build after exact reviewed image-cache repair.
const dispatch=await fetch(base+'/actions/workflows/static-pages.yml/dispatches',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({ref:'main',inputs:{}}),signal:AbortSignal.timeout(20000)});
if(dispatch.status!==204)throw Error('Website dispatch HTTP '+dispatch.status);console.log(JSON.stringify({requested:'static-pages.yml',status:dispatch.status,firecrawlCredits:0}));
let recent;
for(let attempt=0;attempt<6;attempt++){
 await new Promise(resolve=>setTimeout(resolve,2000));
 const response=await fetch(base+'/actions/workflows/static-pages.yml/runs?event=workflow_dispatch&per_page=5&checked='+Date.now(),{headers:auth,cache:'no-store'});if(!response.ok)throw Error('Publication metadata HTTP '+response.status);
 recent=await response.json();if(recent.workflow_runs?.[0]?.id!==44573685362)break;
}
console.log(JSON.stringify({publicationRuns:recent.workflow_runs?.map(r=>({id:r.id,sha:r.head_sha,status:r.status,conclusion:r.conclusion,createdAt:r.created_at})),sourceDirectoriesRequested:0,firecrawlCredits:0}));
