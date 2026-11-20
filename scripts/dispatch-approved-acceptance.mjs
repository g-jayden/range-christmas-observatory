if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Owner repository Actions identity required');
const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY,headers={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json','content-type':'application/json'};
async function api(p,body){const r=await fetch(base+p,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Approved source-free apply HTTP '+r.status);return r.status===204?null:r.json();}
const {workflow_runs:runs}=await api('/actions/runs?per_page=80');
for(const workflow of ['bq.yml']){
 const existing=runs.find(r=>r.path==='.github/workflows/'+workflow&&r.status!=='completed');
 if(existing){console.log(JSON.stringify({workflow,existing:existing.id,status:existing.status,dispatch:false}));continue;}
 const meta=await api('/contents/.github/workflows/'+workflow),yaml=Buffer.from(meta.content,'base64').toString();
 if(!yaml.includes("FIRECRAWL_API_KEY: ${{ inputs.rebuildOnly != true && secrets.FIRECRAWL_API_KEY || '' }}"))throw Error('Source-free credential guard absent');
 await api('/actions/workflows/'+workflow+'/dispatches',{ref:'main',inputs:{rebuildOnly:true}});
 console.log(JSON.stringify({workflow,sourceFreeApplyDispatched:true,input:{rebuildOnly:true},firecrawlCredentialProvided:false,sourceRequests:0,firecrawlCredits:0}));
}
