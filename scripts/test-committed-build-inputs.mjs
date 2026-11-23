import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {restoreCommittedBuildInputs} from './restore-committed-build-inputs.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'committed-build-')),env={GITHUB_ACTIONS:'true',GITHUB_WORKFLOW:'Publish committed catalogues without source collection'};
const git=args=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try{
 git(['init','-q']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
 await fs.mkdir(dir+'/web/images/source',{recursive:true});await fs.writeFile(dir+'/web/catalogue.json','{"products":[{"sku":"official","priceGBP":19.99}]}');await fs.writeFile(dir+'/web/images/source/original.jpg','exact-committed-bytes');git(['add','web']);git(['commit','-qm','Official catalogue snapshot']);
 await fs.writeFile(dir+'/web/catalogue.json','{"products":[{"sku":"test-fixture","priceGBP":0}]}');await fs.writeFile(dir+'/web/test-only.json','{"fake":true}');
 assert.throws(()=>restoreCommittedBuildInputs({cwd:dir,env:{}}),/Only the source-free/);
 const result=restoreCommittedBuildInputs({cwd:dir,env});assert.equal(result.firecrawlCredits,0);assert.equal(JSON.parse(await fs.readFile(dir+'/web/catalogue.json')).products[0].sku,'official');assert.equal(await fs.readFile(dir+'/web/images/source/original.jpg','utf8'),'exact-committed-bytes');await assert.rejects(fs.access(dir+'/web/test-only.json'));assert.equal(git(['status','--porcelain']).trim(),'');
}finally{await fs.rm(dir,{recursive:true,force:true});}
console.log('PASS: source-free publication restores the exact committed catalogue after tests, retains originals and excludes untracked test products without source requests.');
