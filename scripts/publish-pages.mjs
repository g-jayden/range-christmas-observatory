import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The official deploy-pages v5 client caps its timeout at 600000ms even when
// its timeout input is larger. Use the same official REST/OIDC contract while
// allowing one already-uploaded artifact to finish a bounded slow file sync.
export async function publishPages({env=process.env,fetcher=fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),log=v=>console.log(JSON.stringify(v)),maxWaitMs=1800000,artifactWaitMs=120000}={}){
 const repo=env.GITHUB_REPOSITORY,run=env.GITHUB_RUN_ID,attempt=env.GITHUB_RUN_ATTEMPT,sha=env.GITHUB_SHA;
 if(repo!=='g-jayden/range-christmas-observatory'||!/^\d+$/.test(run||'')||!/^\d+$/.test(attempt||'')||!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Invalid Pages repository or workflow identity');
 if(!env.GITHUB_TOKEN||!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw Error('GitHub runtime deployment credentials are unavailable');
 const oidc=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL||'https://invalid.example');if(oidc.protocol!=='https:'||!oidc.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Untrusted GitHub OIDC endpoint');
 if(!(maxWaitMs>0&&maxWaitMs<=1800000))throw Error('Invalid bounded Pages wait');
 const root='https://api.github.com/repos/'+repo,artifactName=env.PAGES_ARTIFACT_NAME||'github-pages-'+run+'-'+attempt;
 const headers={authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','user-agent':'range-christmas-observatory-pages'};
 const request=async(url,options={})=>{let response;try{response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(30000),...options});}catch{throw Error('Pages API transport error');}if(!response.ok)throw Object.assign(Error('Pages API HTTP '+response.status),{status:response.status});if(response.status===204)return {};try{return await response.json();}catch{throw Error('Pages API returned invalid JSON');}};
 if(!(artifactWaitMs>0&&artifactWaitMs<=300000))throw Error('Invalid bounded artifact discovery wait');
 const artifactStartedAt=now();let artifact,artifactChecks=0;
 while(!artifact){
  artifactChecks++;let listed;
  try{listed=await request(root+'/actions/runs/'+run+'/artifacts?per_page=100',{headers});}catch(e){if(![404,429,500,502,503,504].includes(e.status)||now()-artifactStartedAt>=artifactWaitMs)throw e;}
  if(listed){if(!Array.isArray(listed.artifacts))throw Error('Invalid Pages artifact listing');const artifacts=listed.artifacts.filter(a=>a.name===artifactName&&!a.expired);
   if(artifacts.length>1||artifacts.length===1&&!Number.isSafeInteger(artifacts[0].id))throw Error('Exactly one current Pages artifact is required');
   if(artifacts.length===1){artifact=artifacts[0];break;}
  }
  if(now()-artifactStartedAt>=artifactWaitMs)throw Error('Pages artifact discovery exceeded the bounded wait; uploaded files remain saved');
  log({phase:'pages-artifact-index-pending',checks:artifactChecks,elapsedSeconds:Math.round((now()-artifactStartedAt)/1000),sourceRequests:0,firecrawlCredits:0});
  await sleep(Math.min(5000,artifactWaitMs-(now()-artifactStartedAt)));
 }
if(artifact.size_in_bytes>1073741824)throw Error('Pages artifact exceeds the documented 1 GB site limit');
 const identity=await request(oidc.href,{headers:{authorization:'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});if(!identity.value)throw Error('GitHub did not return the deployment identity');
 const created=await request(root+'/pages/deployments',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({artifact_id:artifact.id,pages_build_version:sha,oidc_token:identity.value})});
 const id=String(created.id||created.status_url?.split('/').pop()||sha);if(!/^[a-z0-9_-]{1,128}$/i.test(id))throw Error('Invalid Pages deployment identity');
 const url=root+'/pages/deployments/'+encodeURIComponent(id),startedAt=now();let delay=5000,errors=0,lastState;
 log({phase:'pages-publish-one-artifact',artifactId:artifact.id,artifactBytes:artifact.size_in_bytes,deploymentId:id,maxWaitSeconds:maxWaitMs/1000,sourceRequests:0,firecrawlCredits:0});
 const cancel=async()=>{try{await request(url+'/cancel',{method:'POST',headers});log({phase:'pages-publish-cancelled',deploymentId:id});}catch{log({phase:'pages-publish-cancel-unconfirmed',deploymentId:id});}};
 while(now()-startedAt<maxWaitMs){
  await sleep(Math.min(delay,maxWaitMs-(now()-startedAt)));if(now()-startedAt>=maxWaitMs)break;
  let status;try{status=await request(url,{headers});errors=0;}catch(e){errors++;if(errors>=5){await cancel();throw Error('Pages status could not be verified after five bounded API errors');}log({phase:'pages-status-temporarily-unavailable',errors,status:e.status||0});continue;}
  const state=status.status||'pending';if(state!==lastState){log({phase:'pages-status',deploymentId:id,state,elapsedSeconds:Math.round((now()-startedAt)/1000)});lastState=state;}
  if(state==='succeed')return {deploymentId:id,pageUrl:'https://g-jayden.github.io/range-christmas-observatory/',artifactId:artifact.id,elapsedMs:now()-startedAt,sourceRequests:0,firecrawlCredits:0};
  if(['deployment_failed','deployment_content_failed','deployment_cancelled','deployment_lost'].includes(state))throw Error('Pages reported '+state+'; captured source files remain saved');
  delay=Math.min(30000,Math.round(delay*1.5));
 }
 await cancel();throw Error('Pages file sync exceeded the bounded wait; no source recollection was started');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{const result=await publishPages();if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'page_url='+result.pageUrl+'\n');console.log(JSON.stringify({phase:'pages-publish-complete',...result}));}catch(e){console.error(e.message);process.exitCode=1;}
