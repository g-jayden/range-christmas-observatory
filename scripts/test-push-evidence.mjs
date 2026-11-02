import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'range-push-race-')),remote=path.join(root,'remote.git'),agent=path.join(root,'agent'),other=path.join(root,'other'),script=path.resolve('scripts/push-evidence.mjs');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const configure=dir=>{git(dir,'config','user.name','Evidence Test');git(dir,'config','user.email','test@example.invalid');git(dir,'config','commit.gpgsign','false');};
try{
 git(root,'init','--bare','--initial-branch=main',remote);git(root,'clone',remote,agent);configure(agent);await fs.writeFile(path.join(agent,'seed.txt'),'baseline');git(agent,'add','.');git(agent,'commit','-m','baseline');git(agent,'push','-u','origin','main');git(root,'clone',remote,other);configure(other);
 await fs.writeFile(path.join(agent,'paid-evidence.txt'),'paid original evidence');git(agent,'add','.');git(agent,'commit','-m','save collected evidence');await fs.writeFile(path.join(other,'code.txt'),'concurrent code change');git(other,'add','.');git(other,'commit','-m','independent code update');
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'",marker=path.join(root,'raced'),hook=path.join(agent,'.git/hooks/pre-push');
 await fs.writeFile(hook,'#!/bin/sh\nwhile read local_ref local_sha remote_ref remote_sha; do\nif [ "$remote_ref" = "refs/heads/main" ] && [ ! -f '+quote(marker)+' ]; then\ntouch '+quote(marker)+'\ngit -C '+quote(other)+' push origin main >&2\nfi\ndone\n');await fs.chmod(hook,0o755);
 const output=execFileSync(process.execPath,[script],{cwd:agent,env:{...process.env,GITHUB_RUN_ID:'test-local',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'evidence'},encoding:'utf8',stdio:['ignore','pipe','pipe']});assert(output.includes('"evidenceSaved":true'));assert.equal(git(remote,'show','main:paid-evidence.txt'),'paid original evidence');assert.equal(git(remote,'show','main:code.txt'),'concurrent code change');assert.equal(git(remote,'for-each-ref','--format=%(refname)','refs/heads/collection-checkpoints').split('\n').length,1);console.log('PASS: a real concurrent remote update preserves both source evidence and code; its independent checkpoint remains recoverable without another scrape.');
}finally{await fs.rm(root,{recursive:true,force:true});}
