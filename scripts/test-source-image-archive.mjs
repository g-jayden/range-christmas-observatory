import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {restoreSourceImageArchive} from '../server/source-image-archive.mjs';
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
 console.log('PASS: bulk restoration recovers exact committed source bytes with zero network or source credits; local visual analysis restores a deleted checkpoint image and receives absolute file paths.');
} finally {process.chdir(cwd);await fs.rm(dir,{recursive:true,force:true});}
