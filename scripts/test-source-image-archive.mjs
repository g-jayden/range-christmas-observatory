import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {restoreSourceImageArchive,sourceArchiveRevision} from '../server/source-image-archive.mjs';
import {analysePreviewFiles} from '../server/preview-quality.mjs';
const cwd=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'bulk-source-archive-'));
try {
 process.chdir(dir);const records=[],originals=[];
 for(const colour of ['#36754d','#e5a4c2']){const bytes=await sharp({create:{width:128,height:192,channels:3,background:colour}}).png().toBuffer(),sha256=createHash('sha256').update(bytes).digest('hex'),file='images/source/'+sha256+'.png';records.push({file,sha256});originals.push(bytes);await fs.mkdir('web/images/source',{recursive:true});await fs.writeFile('web/'+file,bytes);}
 const git=(...args)=>execFileSync('git',args,{stdio:'pipe'});git('init','-q');git('add','web');git('-c','user.name=Archive Test','-c','user.email=archive@example.invalid','commit','-qm','Save source objects');for(const r of records)await fs.unlink('web/'+r.file);
 const fetcher=()=>{throw Error('Committed originals must not make network requests');},a=await restoreSourceImageArchive(records,{fetcher});assert.equal(a.restored,2);assert.equal(a.firecrawlCredits,0);assert.equal(a.archiveHttpRequests,0);assert.equal(a.missing,0);for(let i=0;i<records.length;i++)assert.deepEqual(await fs.readFile('web/'+records[i].file),originals[i]);
 await fs.unlink('web/'+records[0].file);let analyses=0;
 const classify=async(files,prompts)=>{analyses+=files.length;for(const f of files){assert(path.isAbsolute(f),'The model receives a real absolute file path');await fs.access(f);}return files.map(()=>prompts.map((label,i)=>({label,score:i===0?.9:.01})));};
 await analysePreviewFiles([{hash:records[0].sha256,file:'web/'+records[0].file}],{classify});assert.equal(analyses,1);assert.deepEqual(await fs.readFile('web/'+records[0].file),originals[0]);
 const b=await restoreSourceImageArchive(records,{fetcher});assert.equal(b.restored,0);assert.equal(b.alreadyPresent,2);await assert.rejects(restoreSourceImageArchive([{file:'../escape.png',sha256:'a'.repeat(64)}]));
 // Public archive URLs must use the confirmed publication, not the private
 // collector commit. Missing or stale publication proofs must fail closed.
 const localRevision='a'.repeat(40),publicRevision='b'.repeat(40),env={EVIDENCE_ISOLATE_WORKTREE:'1',GITHUB_RUN_ID:'archive-test',GITHUB_RUN_ATTEMPT:'2'};
 const run=(_command,args)=>args.includes('refs/remotes/origin/main')?publicRevision:localRevision;
 await fs.mkdir('runtime',{recursive:true});
 await fs.writeFile('runtime/evidence-publication.json',JSON.stringify({revision:publicRevision,collectorRevision:localRevision,runId:env.GITHUB_RUN_ID,runAttempt:'2'}));
 assert.equal(sourceArchiveRevision({root:dir,env,run}),publicRevision);
 await fs.writeFile('runtime/evidence-publication.json',JSON.stringify({revision:publicRevision,collectorRevision:localRevision,runId:'previous-run',runAttempt:'2'}));
 assert.throws(()=>sourceArchiveRevision({root:dir,env,run}),/no confirmed public revision/);
 await fs.unlink('runtime/evidence-publication.json');
 assert.throws(()=>sourceArchiveRevision({root:dir,env,run}),/confirmed public image archive revision/);
 assert.equal(sourceArchiveRevision({root:dir,env,run:()=>publicRevision}),publicRevision,'Cached-only checkout may restore its fetched public main revision before any checkpoint');
 assert.equal(sourceArchiveRevision({root:dir,env:{...env,EVIDENCE_ISOLATED_PUBLISHER:'1'},run}),localRevision);
 const archive=new Map(),remoteRecords=[],tree=[];for(let i=0;i<513;i++){const bytes=Buffer.concat([originals[0],Buffer.from(String(i))]),sha256=createHash('sha256').update(bytes).digest('hex'),file='images/source/'+sha256+'.png';archive.set('web/'+file,bytes);remoteRecords.push({file,sha256});tree.push('100644 blob '+(i+1).toString(16).padStart(40,'0')+'\tweb/'+file);}
 let gitFetches=0;const remoteRun=(_cmd,args)=>{if(args[0]==='rev-parse')return publicRevision;if(args[0]==='ls-tree')return tree.join('\0')+'\0';if(args[0]==='cat-file')return '';if(args[0]==='fetch'){gitFetches++;throw Error('Bulk Git archive transport unavailable');}throw Error('Unexpected archive command');};
 const fallback=await restoreSourceImageArchive(remoteRecords,{run:remoteRun,fetcher:async url=>new Response(archive.get(new URL(url).pathname.split('/'+publicRevision+'/')[1]))});assert.equal(gitFetches,1);assert.equal(fallback.restored,513);assert.equal(fallback.missing,0);assert.equal(fallback.archiveHttpRequests,513);assert.equal(fallback.sourceRequests,0);assert.equal(fallback.firecrawlCredits,0);
 console.log('PASS: bulk restoration recovers exact committed source bytes with zero network or source credits; local visual analysis restores a deleted checkpoint image and receives absolute file paths.');
 console.log('PASS: isolated collectors use confirmed public image revisions; stale proofs and unpublished commits are rejected, and fresh cached-only public checkouts remain valid.');
 console.log('PASS: a failed bulk Git transport switches once to the free public archive and restores all 513 exact objects without repeating failed Git batches or paid source requests.');
} finally {process.chdir(cwd);await fs.rm(dir,{recursive:true,force:true});}
