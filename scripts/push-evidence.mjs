import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const git=(...args)=>execFileSync('git',args,{stdio:'inherit'}),read=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(!process.env.GITHUB_RUN_ID)throw Error('Evidence publishing is restricted to its GitHub workflow');
// Rebase data onto the already-authorised workflow revision. Creating a new
// branch can require workflow-file permission even for a data-only checkpoint.
// The collector writes only web/ data to main and never requests that scope.
let saved=false;for(let attempt=1;attempt<=4;attempt++){
 try{
  git('pull','--rebase');
  const changed=read('diff','--name-only','origin/main..HEAD').split('\n').filter(Boolean);
  if(changed.some(p=>!p.startsWith('web/')))throw Object.assign(Error('Collector publication contains non-data files; refused'),{nonData:true});
  git('push','origin','HEAD:refs/heads/main');saved=true;break;
 }catch(error){const rebase=read('rev-parse','--git-path','rebase-merge');if(error.nonData||fs.existsSync(rebase))throw Error('Data publication requires reconciliation; recover the workflow source-evidence archive');if(attempt<4)await new Promise(r=>setTimeout(r,1500));}
}
if(!saved)throw Error('Main was not updated; recover the source-evidence artifact instead of collecting again');
console.log(JSON.stringify({evidenceSaved:true,dataOnly:true,commit:read('rev-parse','HEAD')}));
