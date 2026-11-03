import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const git=(...args)=>execFileSync('git',args,{stdio:'inherit'}),read=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const head=read('rev-parse','HEAD'),key=[process.env.GITHUB_RUN_ID,process.env.GITHUB_RUN_ATTEMPT,process.env.GITHUB_JOB,head.slice(0,12)].filter(Boolean).join('-').replace(/[^A-Za-z0-9_-]/g,'-');
if(!process.env.GITHUB_RUN_ID)throw Error('Evidence publishing is restricted to its GitHub workflow');
const checkpoint='collection-checkpoints/'+key;
// This unique ref keeps paid files recoverable even if main changes mid-push.
for(let attempt=1;attempt<=3;attempt++){
 try{git('push','origin','HEAD:refs/heads/'+checkpoint);break;}
 catch(error){
  // A lost acknowledgement can follow a successful server-side write.
  const published=read('ls-remote','origin','refs/heads/'+checkpoint).split(/\s/)[0];
  if(published===head)break;
  if(attempt===3)throw error;
  await new Promise(r=>setTimeout(r,1500));
 }
}
let saved=false;for(let attempt=1;attempt<=4;attempt++){
 try{git('pull','--rebase');git('push');saved=true;break;}
 catch(error){const rebase=read('rev-parse','--git-path','rebase-merge');if(fs.existsSync(rebase))throw Error('Merge requires review; evidence is preserved on '+checkpoint);if(attempt<4)await new Promise(r=>setTimeout(r,1500));}
}
if(!saved)throw Error('Main could not be updated; paid evidence is preserved on '+checkpoint);
console.log(JSON.stringify({evidenceSaved:true,checkpoint,commit:read('rev-parse','HEAD')}));
