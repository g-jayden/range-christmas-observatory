if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!process.env.GITHUB_TOKEN)throw Error('Repository Actions identity required');
const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY,auth={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
async function get(path){const r=await fetch(base+path,{headers:auth,cache:'no-store'});if(!r.ok)throw Error('Queue acceptance HTTP '+r.status);return r.json();}
// Cancel only the superseded, source-free helper-cleanup push before its work.
// Keep every scheduled collection, paid run and saved catalogue untouched.
const id=44580270681,run=await get('/actions/runs/'+id);
if(run.path==='.github/workflows/daily-pages.yml'&&run.event==='push'&&run.head_sha==='2b7350f4e0619a472cd8de335ad638b646ae1c30'&&['pending','queued','in_progress'].includes(run.status)){
 const requests=await Promise.all(['web/evidence-repair-request.json','web/asda/request.json'].map(async path=>{const r=await get('/contents/'+path+'?ref=main');return JSON.parse(Buffer.from(r.content,'base64').toString());}));
 const jobs=await get('/actions/runs/'+id+'/jobs'),workStarted=jobs.jobs.some(j=>j.steps?.some(s=>s.number>=6&&s.status!=='pending'));
 if(requests.every(r=>r.state==='complete')&&!workStarted){const r=await fetch(base+'/actions/runs/'+id+'/cancel',{method:'POST',headers:auth});if(r.status!==202&&r.status!==409)throw Error('Obsolete publication cancellation HTTP '+r.status);console.log(JSON.stringify({obsoletePublicationRun:id,cancelAccepted:r.status===202,sourceRequests:0,firecrawlCredits:0,mailSent:false}));}
 else console.log(JSON.stringify({obsoletePublicationRun:id,preserved:true,reason:'Collector request or subsequent work must be retained',sourceRequests:0,firecrawlCredits:0}));
}
const recent=await get('/actions/runs?per_page=25');console.log(JSON.stringify({recentRuns:recent.workflow_runs.map(r=>({id:r.id,path:r.path,status:r.status,event:r.event,sha:r.head_sha})),sourceRequests:0,firecrawlCredits:0}));
