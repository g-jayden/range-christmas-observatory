if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Repository Actions identity required');
const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY,headers={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json','content-type':'application/json'};
const r=await fetch(base+'/actions/workflows/bq.yml/dispatches',{method:'POST',headers,body:JSON.stringify({ref:'main',inputs:{rebuildOnly:false,recoverArtifact:''}})});if(r.status!==204)throw Error('Current B&Q source dispatch HTTP '+r.status);
console.log(JSON.stringify({currentBQWorkflowRequested:true,ordinaryMonthlyLimitUnchanged:2000,maxCreditsPerRun:60,sourceRequestsMade:false,firecrawlCredits:0,mailSent:false}));
