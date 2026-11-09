import {execFileSync} from 'node:child_process';
// The flag is set on the real collection step, never on tests or publication.
// Git's existing workflow credential is used; no credential is read or copied.
export async function publishCollectionCheckpoint({stage}={}, {env=process.env,run=execFileSync}={}){
 if(env.COLLECTION_CHECKPOINTS!=='1')return null;
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!env.GITHUB_RUN_ID)throw Error('Checkpoint publication is restricted to the collection workflow');
 const git=(...args)=>run('git',args,{stdio:'inherit'});
 git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');git('add','--','web');
 let changed=false;try{git('diff','--cached','--quiet')}catch(e){if(e.status!==1)throw e;changed=true;}
 if(changed)git('commit','-m',stage==='discovery'?'Checkpoint verified source discovery before NEW processing':'Checkpoint verified NEW files before queuing email');
 run(process.execPath,['scripts/push-evidence.mjs'],{stdio:'inherit'});
 const revision=String(run('git',['rev-parse','HEAD'],{encoding:'utf8'})).trim();
 if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Checkpoint revision was not verified');
 console.log(JSON.stringify({phase:'durable-collection-checkpoint',stage,revision,sourceRequestsMade:false,firecrawlCredits:0}));
 return {published:true,revision,stage};
}
