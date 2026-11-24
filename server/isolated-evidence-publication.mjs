import fs from'node:fs/promises';import {readFileSync}from'node:fs';import os from'node:os';import path from'node:path';import{execFileSync,spawn}from'node:child_process';
const capture=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:67108864,stdio:['ignore','pipe','pipe']}).trim();
export function publishedEvidenceRevision({root=process.cwd(),env=process.env,localRevision=capture(root,['rev-parse','HEAD'])}={}){
 if(env.EVIDENCE_ISOLATE_WORKTREE!=='1'||env.EVIDENCE_ISOLATED_PUBLISHER==='1')return localRevision;
 const marker=JSON.parse(readFileSync(path.join(root,'runtime/evidence-publication.json'),'utf8'));
 if(marker.collectorRevision!==localRevision||marker.runId!==env.GITHUB_RUN_ID||marker.runAttempt!==(env.GITHUB_RUN_ATTEMPT||'1')||!/^[a-f0-9]{40}$/.test(marker.revision||''))throw Error('The current collector commit has no confirmed public revision');
 return marker.revision;
}
export async function isolateEvidencePublication({root=process.cwd(),env=process.env,publish}={}){
 if(!env.GITHUB_RUN_ID)throw Error('Isolated evidence publication requires its workflow identity');
 const collectorRevision=capture(root,['rev-parse','HEAD']),directory=await fs.mkdtemp(path.join(os.tmpdir(),'range-evidence-publisher-'));let completed=false,previous;
 try{const m=JSON.parse(await fs.readFile(path.join(root,'runtime/evidence-publication.json'),'utf8'));if(m.runId===env.GITHUB_RUN_ID&&m.runAttempt===(env.GITHUB_RUN_ATTEMPT||'1')){if(!/^[a-f0-9]{40}$/.test(m.revision||'')||!/^[a-f0-9]{40}$/.test(m.collectorRevision||''))throw Error('Invalid prior publication proof');capture(root,['merge-base','--is-ancestor',m.collectorRevision,collectorRevision]);capture(root,['cat-file','-e',m.revision+'^{commit}']);previous=m;}}catch(error){if(error.code!=='ENOENT')throw error;}
 try{
  const publicationBase=previous?.revision||collectorRevision;
  capture(root,['worktree','add','--no-checkout','--detach',directory,publicationBase]);
  // Git checkout already enables worktree-local configuration for sparse jobs.
  // Sparse settings in this detached publisher cannot alter the live collector.
  const sparse=env.EVIDENCE_NATIVE_ONLY==='1'?'/server/\n/scripts/\n/web/collection-ledger.json\n/web/preview-quality-cache.json.gz\n/web/paid-native-index.json\n':'/*\n!/web/images/\n!/web/reports/\n!/web/mail-assets/\n';
  execFileSync('git',['sparse-checkout','set','--no-cone','--stdin'],{cwd:directory,input:sparse,stdio:['pipe','pipe','pipe']});
  // --no-checkout leaves the new worktree index unpopulated. Initialise only
  // this disposable publisher, with the collector's exact committed evidence.
  capture(directory,['reset','--hard',publicationBase]);
  // The collector deliberately keeps its old executable files and HEAD.
  // Replay only data changed since its last confirmed publication, onto that
  // publication's merged tree. Replaying the whole local history would revive
  // old source snapshots and create add/add conflicts on later checkpoints.
  if(previous){
   const changed=capture(root,['diff','--name-only','-z',previous.collectorRevision,collectorRevision]).split('\0').filter(Boolean);
   if(changed.some(file=>!file.startsWith('web/')))throw Error('Isolated collector delta contains non-data files');
   for(let offset=0;offset<changed.length;offset+=200)capture(directory,['restore','--source',collectorRevision,'--staged','--ignore-skip-worktree-bits','--',...changed.slice(offset,offset+200)]);
   let staged=false;try{capture(directory,['diff','--cached','--quiet']);}catch(error){if(error.status!==1)throw error;staged=true;}
   if(staged)capture(directory,['commit','-m','Publish new source evidence since the previous checkpoint [skip ci]']);
   // Only the disposable publisher reapplies sparse files. Source image
   // blobs remain committed without copying them or other-store catalogues.
   capture(directory,['sparse-checkout','reapply']);
   capture(directory,['reset','--hard','HEAD']);
  }
  const childEnv={...env,EVIDENCE_ISOLATED_PUBLISHER:'1'};
  if(publish)await publish(directory,childEnv);else await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/push-evidence.mjs'],{cwd:directory,env:childEnv,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Isolated publication exited '+code)));});
  const revision=capture(directory,['rev-parse','HEAD']);
  if(capture(root,['rev-parse','HEAD'])!==collectorRevision)throw Error('Collector revision changed during its isolated publication');
  // Refresh only mergeable shared metadata, never source image directories,
  // executable files or the collector's index/HEAD.
  for(const file of['web/collection-ledger.json','web/preview-quality-cache.json.gz','web/paid-native-index.json']){
   try{capture(directory,['cat-file','-e',revision+':'+file]);}catch{continue;}
   const bytes=execFileSync('git',['show',revision+':'+file],{cwd:directory,maxBuffer:67108864,stdio:['ignore','pipe','pipe']});await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file+'.published-tmp'),bytes);await fs.rename(path.join(root,file+'.published-tmp'),path.join(root,file));
  }
  const marker={revision,collectorRevision,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT||'1',publishedAt:new Date().toISOString(),sourceRequests:0,firecrawlCredits:0};await fs.mkdir(path.join(root,'runtime'),{recursive:true});await fs.writeFile(path.join(root,'runtime/evidence-publication.json'),JSON.stringify(marker));completed=true;return marker;
 }finally{if(completed)capture(root,['worktree','remove','--force',directory]);else console.error(JSON.stringify({phase:'isolated-publication-preserved-for-recovery',directory,collectorFilesUnchanged:true}));}
}
