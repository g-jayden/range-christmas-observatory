import fs from'node:fs/promises';import path from'node:path';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
import {publishedEvidenceRevision} from './isolated-evidence-publication.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function sourceArchiveRevision({root=process.cwd(),env=process.env,run=execFileSync}={}){
 const git=(...args)=>run('git',args,{cwd:root,encoding:'utf8',maxBuffer:67108864,stdio:['ignore','pipe','pipe']}).trim(),localRevision=git('rev-parse','HEAD');
 if(env.EVIDENCE_ISOLATE_WORKTREE==='1'&&env.EVIDENCE_ISOLATED_PUBLISHER!=='1')try{return publishedEvidenceRevision({root,env,localRevision});}catch(error){
  // A cached-only job has not made a local checkpoint yet. Its fetched main
  // commit is public. A private collector checkpoint must never become a raw
  // GitHub URL: that returns 404 for every otherwise valid saved original.
  if(error.code!=='ENOENT')throw error;
  let fetched;try{fetched=git('rev-parse','--verify','refs/remotes/origin/main');}catch{}
  if(localRevision!==fetched)throw Error('A confirmed public image archive revision is required before restoring collector files');
 }
 return localRevision;
}
export async function restoreSourceImageArchive(records,{root='web',run=execFileSync,fetcher=fetch}={}){
 const wanted=new Map;for(const r of records){const file=r?.file,sha=r?.sha256;if(!file||!sha)continue;if(!/^images\/(?:source|previews)\/[a-f0-9]{64}(?:-native)?\.(?:jpe?g|png|webp|avif|gif)$/.test(file)||!path.basename(file).startsWith(sha)||!/^[a-f0-9]{64}$/.test(sha))throw Error('Bound source image archive path required');wanted.set(root+'/'+file,sha);}
 const missing=[];for(const[file,sha]of wanted)try{if(hash(await fs.readFile(file))!==sha)missing.push(file);}catch(e){if(e.code!=='ENOENT')throw e;missing.push(file);}if(!missing.length)return{restored:0,alreadyPresent:wanted.size,missing:0,sourceRequests:0,firecrawlCredits:0};
 const git=(...args)=>run('git',args,{encoding:'utf8',maxBuffer:67108864,stdio:['ignore','pipe','pipe']});
 const commit=sourceArchiveRevision({run});if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Committed archive revision required');
 const tree=new Map(git('ls-tree','-rz',commit,'--',root+'/images').split('\0').filter(Boolean).map(line=>{const m=line.match(/^\d+ blob ([a-f0-9]{40})\t(.+)$/);return m?[m[2],m[1]]:[];}).filter(a=>a.length)),local=new Set(git('cat-file','--batch-all-objects','--batch-check=%(objectname)').trim().split('\n'));
 const needed=[...new Set(missing.map(file=>tree.get(file)).filter(oid=>oid&&!local.has(oid)))];let batches=0,gitObjectBatchAttempts=0;
 for(let start=0;start<needed.length;start+=512){const batch=needed.slice(start,start+512);gitObjectBatchAttempts++;try{git('fetch','--no-tags','--no-write-fetch-head','--recurse-submodules=no','origin',...batch);for(const oid of batch)local.add(oid);batches++;}catch{
  // Do not repeat dozens of failed Git transports before the working free
  // public archive. Every remaining object is still restored and SHA-checked
  // below; this switches free transports, never source scope or paid scraping.
  break;
 }}
 let cursor=0,restored=0,archiveHttpRequests=0;const failures=[];
 await Promise.all(Array.from({length:Math.min(8,missing.length)},async()=>{while(cursor<missing.length){const file=missing[cursor++],oid=tree.get(file);if(!oid){failures.push({file,reason:'not-in-committed-archive'});continue;}try{let b;if(local.has(oid))b=run('git',['cat-file','blob',oid],{encoding:'buffer',maxBuffer:25000001,stdio:['ignore','pipe','pipe']});else{archiveHttpRequests++;const url='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/'+commit+'/'+file,r=await fetcher(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Archive HTTP '+r.status);b=Buffer.from(await r.arrayBuffer());}if(b.length>25000000||hash(b)!==wanted.get(file))throw Error('Archived source digest mismatch');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,b);restored++;}catch(e){failures.push({file,reason:e.message});}}}));
 return{restored,alreadyPresent:wanted.size-missing.length,missing:failures.length,failures,archiveRevision:commit,gitObjectBatchAttempts,gitObjectBatches:batches,archiveHttpRequests,retailerRequests:0,sourceRequests:0,firecrawlCredits:0};
}
