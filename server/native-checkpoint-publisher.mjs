import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Small, explicitly staged native batches use the existing data-only Git
// publisher, including its receipt reconciliation, without a second ledger CAS.
export function nativeGitCheckpointPublisher({enabled=false,env=process.env,run=execFileSync,readFile=fs.readFile}={}){
 if(!enabled)return async()=>null;
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!env.GITHUB_RUN_ID)throw Error('Native checkpoint publication requires its authorised workflow');
 return async files=>{
  const selected=[...new Set(files)];for(const file of selected){if(!/^web\/(?:images\/source\/[a-f0-9]{64}\.(?:jpg|png|webp|avif|gif)|range-native(?:-index|-status|-checkpoint)\.json|collection-ledger\.json)$/.test(file))throw Error('Unexpected native checkpoint path');if(file.includes('/images/')){const b=await readFile(file),hash=createHash('sha256').update(b).digest('hex');if(!file.includes('/'+hash+'.')||b.length>25000000)throw Error('Original bytes changed or exceed the native checkpoint guard');}}
  const git=(...args)=>run('git',args,{env,stdio:'pipe'});git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');git('add','--sparse','--',...selected);let changed=false;try{git('diff','--cached','--quiet');}catch(e){if(e.status!==1)throw e;changed=true;}if(changed)git('commit','-m','Preserve exact native image batch and source bindings [skip ci]');
  run(process.execPath,['scripts/push-evidence.mjs'],{env,stdio:'inherit'});const revision=String(run('git',['rev-parse','HEAD'],{env,encoding:'utf8'})).trim();if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Native checkpoint revision not confirmed');return revision;
 };
}

// Upload immutable originals separately. A single multi-gigabyte Git pack can
// be rejected after collection succeeds; only advance the source index after
// every referenced original is durable. CAS retries reuse already uploaded blobs.
export function nativeCheckpointPublisher({token,repository,fetcher=fetch,readFile=fs.readFile,enabled=false}={}) {
  if(!enabled)return async()=>null;
  if(repository!=='g-jayden/range-christmas-observatory'||!token)throw Error('Repository-native checkpoint credential required');
  const uploaded=new Map(),base='https://api.github.com/repos/'+repository;
  const knownLedgerShas=new Set(),ledgerBase=readFile('web/collection-ledger.json').then(bytes=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  async function api(route,body,method=body?'POST':'GET') {
    let last;
    for(let attempt=0;attempt<3;attempt++) {
      try {const r=await fetcher(base+route,{method,headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});if(!r.ok){const e=Object.assign(Error('Native checkpoint GitHub HTTP '+r.status),{status:r.status});if(r.status<500)throw e;last=e;}else return r.status===204?{}:await r.json();}
      catch(e){last=e;if(e.status&&e.status<500)throw e;}
      if(attempt<2)await new Promise(r=>setTimeout(r,1000*(attempt+1)));
    }
    throw last;
  }
  return async files=>{
    const tree=[];
    for(const file of [...new Set(files)]) {
      if(!/^web\/(?:images\/source\/[a-f0-9]{64}\.(?:jpg|png|webp|avif|gif)|range-native(?:-index|-status|-checkpoint)\.json|collection-ledger\.json)$/.test(file))throw Error('Unexpected native checkpoint path');
      const bytes=await readFile(file),hash=createHash('sha256').update(bytes).digest('hex');
      if(file.includes('/images/')&&!file.includes('/'+hash+'.'))throw Error('Original bytes changed before publication');
      if(bytes.length>25000000)throw Error('Native checkpoint individual file exceeds guard');
      const cacheKey=file+':'+hash;let sha=uploaded.get(cacheKey);
      if(!sha){sha=(await api('/git/blobs',{content:bytes.toString('base64'),encoding:'base64'})).sha;uploaded.set(cacheKey,sha);}
      tree.push({path:file,mode:'100644',type:'blob',sha});
    }
    for(let attempt=0;attempt<4;attempt++) {
      const ref=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+ref.object.sha),ledgerEntry=tree.find(e=>e.path==='web/collection-ledger.json');if(ledgerEntry){const remote=await api('/contents/web/collection-ledger.json?ref='+ref.object.sha),initial=await ledgerBase;if(remote.sha!==initial&&!knownLedgerShas.has(remote.sha)&&remote.sha!==ledgerEntry.sha)throw Error('Concurrent credit ledger update: preserve both receipts and reconcile before another paid request');}const t=await api('/git/trees',{base_tree:parent.tree.sha,tree}),commit=await api('/git/commits',{message:'Checkpoint exact native originals and bounded credit receipt [skip ci]',tree:t.sha,parents:[ref.object.sha]});
      try {await api('/git/refs/heads/main',{sha:commit.sha,force:false},'PATCH');if(ledgerEntry)knownLedgerShas.add(ledgerEntry.sha);console.log(JSON.stringify({phase:'Durable exact native checkpoint',files:tree.length,revision:commit.sha,sourceRequests:0,firecrawlCredits:0}));return commit.sha;}
      catch(e){if(![409,422].includes(e.status)||attempt===3)throw e;}
    }
  };
}
