import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export async function runIsolatedWorkflowTests({root=process.cwd(),env=process.env,command='npm',args=['test']}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory')throw Error('Isolated checks require their authorised repository workflow');
 const git=(cwd,argv,input)=>execFileSync('git',argv,{cwd,encoding:'utf8',maxBuffer:16777216,input,stdio:['pipe','pipe','pipe']}).trim();
 const head=git(root,['rev-parse','HEAD']),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'observatory-test-worktree-'));let added=false;
 try{
  await fs.access(path.join(root,'node_modules'));git(root,['worktree','add','--detach','--no-checkout',temporary,head]);added=true;
  git(temporary,['sparse-checkout','set','--no-cone','--stdin'],'/*\n!/web/images/\n!/web/reports/\n!/web/mail-assets/\n');git(temporary,['reset','--hard',head]);
  await fs.symlink(path.resolve(root,'node_modules'),path.join(temporary,'node_modules'),'dir');
  const childEnv=Object.fromEntries(Object.entries(env).filter(([k])=>!/(?:TOKEN|SECRET|API_KEY|PASSWORD|PRIVATE_KEY|CREDENTIAL|CONTROL_API_URL|ACTIONS_ID_TOKEN_REQUEST_URL|ACTIONS_RESULTS_URL|ACTIONS_RUNTIME_URL)/i.test(k)&&!['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR'].includes(k)));
  Object.assign(childEnv,{GITHUB_WORKSPACE:temporary,PWD:temporary,INIT_CWD:temporary,COLLECTION_CHECKPOINTS:'0'});
  await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:temporary,env:childEnv,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Isolated regression tests failed with exit '+code)));});
  if(git(root,['rev-parse','HEAD'])!==head)throw Error('Collector revision changed while running isolated checks');
  return{passed:true,collectorRevision:head,fixturesConfinedToDisposableWorktree:true,productionCredentialsPassed:false,sourceRequests:0,firecrawlCredits:0};
 }finally{if(added)git(root,['worktree','remove','--force',temporary]);else await fs.rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log(JSON.stringify({phase:'isolated-source-regression-tests',...await runIsolatedWorkflowTests()}));
