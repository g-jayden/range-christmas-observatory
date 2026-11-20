import fs from'node:fs/promises';import{execFileSync}from'node:child_process';import{verifiedCheckoutFromLog}from'../server/native-restore-checkout.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory')throw Error('Owner recovery workflow required');
const run=44707707847,job=136212836217,id=14620947782,root='https://api.github.com/repos/g-jayden/range-christmas-observatory',headers={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},get=p=>fetch(root+p,{headers,signal:AbortSignal.timeout(60000)});
const a=await get('/actions/artifacts/'+id).then(async r=>{if(!r.ok)throw Error('Archive verification HTTP '+r.status);return r.json();});
if(a.name!=='native-original-evidence-'+run+'-1'||a.expired||a.workflow_run.id!==run||a.workflow_run.head_repository_id!==1439271815||a.digest!=='sha256:c9536f77127c547b734a3ba792479c6372e208e2b971762a81e02004fb45ce5c')throw Error('Unapproved native evidence archive');
const j=await get('/actions/jobs/'+job).then(async r=>{if(!r.ok)throw Error('Job verification HTTP '+r.status);return r.json();});if(j.run_id!==run||j.status!=='completed')throw Error('Native source job still active or foreign');
let r=await get('/actions/jobs/'+job+'/logs'),log;if(r.ok)log=await r.text();else{
 r=await get('/actions/runs/'+run+'/logs');if(!r.ok)throw Error('Actual collector checkout proof unavailable: HTTP '+r.status);
 await fs.mkdir('runtime/restore-native-proof',{recursive:true});await fs.writeFile('runtime/restore-native-proof/logs.zip',Buffer.from(await r.arrayBuffer()));
 log=execFileSync('python3',['-c',"import zipfile; z=zipfile.ZipFile('runtime/restore-native-proof/logs.zip'); print('\\n'.join(z.read(n).decode('utf-8',errors='replace') for n in z.namelist() if n.endswith('.txt')))"] ,{encoding:'utf8',maxBuffer:67108864});
}
const base=verifiedCheckoutFromLog(log),proof={run,job,artifactId:id,actualCheckout:base,bytes:a.size_in_bytes,digest:a.digest,sourceRequests:0,firecrawlCredits:0};await fs.mkdir('runtime/restore-native-proof',{recursive:true});await fs.writeFile('runtime/restore-native-proof/source.json',JSON.stringify(proof));await fs.appendFile(process.env.GITHUB_ENV,'NATIVE_RESTORE_BASE_SHA='+base+'\n');console.log(JSON.stringify(proof));
