if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Repository Actions identity required');
// Read publication metadata only; no collection, delivery or dispatch.
const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY;
const auth={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
const response=await fetch(base+'/actions/workflows/static-pages.yml/runs?event=workflow_dispatch&per_page=8&checked='+Date.now(),{headers:auth,cache:'no-store',signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('Read publication metadata HTTP '+response.status);
const recent=await response.json();
console.log(JSON.stringify({publicationRuns:recent.workflow_runs?.map(r=>({id:r.id,sha:r.head_sha,status:r.status,conclusion:r.conclusion,createdAt:r.created_at})),sourceRequests:0,firecrawlCredits:0}));
