import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'range-push-race-')),remote=path.join(root,'remote.git'),agent=path.join(root,'agent'),other=path.join(root,'other'),script=path.resolve('scripts/push-evidence.mjs');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:67108864,stdio:['ignore','pipe','pipe']}).trim();
const nativeIndexPadding='x'.repeat(1200000);
const configure=dir=>{git(dir,'config','user.name','Evidence Test');git(dir,'config','user.email','test@example.invalid');git(dir,'config','commit.gpgsign','false');};
try{
 git(root,'init','--bare','--initial-branch=main',remote);git(root,'clone',remote,agent);configure(agent);await fs.writeFile(path.join(agent,'seed.txt'),'baseline');await fs.mkdir(path.join(agent,'web'));await fs.writeFile(path.join(agent,'web/paid-native-index.json'),JSON.stringify({version:1,fixturePadding:nativeIndexPadding,entries:{}}));await fs.writeFile(path.join(agent,'web/collection-ledger.json'),JSON.stringify({periods:{'2026-11':{used:100,runs:[],reservations:{}}}}));git(agent,'add','.');git(agent,'commit','-m','baseline');git(agent,'push','-u','origin','main');git(root,'clone',remote,other);configure(other);
 for(const[dir,id,n]of[[agent,'native-batch',2],[other,'native-mail',1]]){await fs.writeFile(path.join(dir,'web/paid-native-index.json'),JSON.stringify({version:1,fixturePadding:nativeIndexPadding,entries:{[id]:{url:id,fixture:true}},lastReceipt:{id,credits:n,completedAt:'2026-11-20T07:00:0'+n+'Z'}}));await fs.writeFile(path.join(dir,'web/collection-ledger.json'),JSON.stringify({periods:{'2026-11':{used:100+n,runs:[{key:id,credits:n,receipt:{id},completedAt:'2026-11-20T07:00:0'+n+'Z'}],reservations:{}}},nativeImageFallback:{id,credits:n,completedAt:'2026-11-20T07:00:0'+n+'Z'}}));}
 await fs.writeFile(path.join(agent,'web/paid-evidence.json'),'paid original evidence');git(agent,'add','.');git(agent,'commit','-m','save collected evidence');await fs.writeFile(path.join(agent,'web/preview-quality-cache.json.gz'),'known shared cache evidence');await fs.writeFile(path.join(other,'code.txt'),'concurrent code change');git(other,'add','.');git(other,'commit','-m','independent code and native-mail evidence update');
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'",marker=path.join(root,'raced'),hook=path.join(agent,'.git/hooks/pre-push');
 await fs.writeFile(hook,'#!/bin/sh\nwhile read local_ref local_sha remote_ref remote_sha; do\nif [ "$remote_ref" = "refs/heads/main" ] && [ ! -f '+quote(marker)+' ]; then\ntouch '+quote(marker)+'\ngit -C '+quote(other)+' push origin main >&2\nfi\ndone\n');await fs.chmod(hook,0o755);
 const output=execFileSync(process.execPath,[script],{cwd:agent,env:{...process.env,CONTROL_API_URL:'',CONTROL_TOKEN:'',GITHUB_RUN_ID:'test-local',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'evidence'},encoding:'utf8',stdio:['ignore','pipe','pipe']});assert(output.includes('"evidenceSaved":true'));assert.equal(git(remote,'show','main:web/paid-evidence.json'),'paid original evidence');assert.equal(git(remote,'show','main:code.txt'),'concurrent code change');assert.equal(git(remote,'for-each-ref','--format=%(refname)','refs/heads/collection-checkpoints').split('\n').length,1);assert.equal(git(remote,'show','main:web/preview-quality-cache.json.gz'),'known shared cache evidence');const index=JSON.parse(git(remote,'show','main:web/paid-native-index.json')),billing=JSON.parse(git(remote,'show','main:web/collection-ledger.json'));assert(index.entries['native-batch']&&index.entries['native-mail']);assert.equal(billing.periods['2026-11'].used,103);assert.equal(billing.periods['2026-11'].runs.length,2);assert.equal(billing.nativeImageFallback.id,'native-batch');console.log('PASS: real concurrent publication preserves original-index entries, both billing receipts, source evidence and unrelated code without another scrape.');
}finally{await fs.rm(root,{recursive:true,force:true});}

// A collector can commit source/receipts first and then auto-save the shared
// image cache. Rebase must reconcile both commits, including a cache outside
// the sparse collector's checkout, without fetching its source again.
for(const sparse of [false,true]){
 const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'range-push-multi-')),remote=path.join(fixture,'remote.git'),agent=path.join(fixture,'agent'),other=path.join(fixture,'other');
 const cacheFile='web/preview-quality-cache.json.gz',hashes=['a','b','c'].map(c=>c.repeat(64));
 const cache=ids=>gzipSync(JSON.stringify({version:'fixture-v1',entries:Object.fromEntries(ids.map((n)=>[hashes[n],{imageHash:hashes[n],checkedAt:'2026-11-24T22:00:00Z',fixture:n}]))}));
 try{
  git(fixture,'init','--bare','--initial-branch=main',remote);git(fixture,'clone',remote,agent);configure(agent);await fs.mkdir(path.join(agent,'web'));
  await fs.writeFile(path.join(agent,cacheFile),cache([0]));await fs.writeFile(path.join(agent,'web/collection-ledger.json'),JSON.stringify({periods:{'2026-11':{used:100,runs:[],reservations:{}}}}));await fs.writeFile(path.join(agent,'seed.txt'),'baseline');git(agent,'add','.');git(agent,'commit','-m','baseline');git(agent,'push','-u','origin','main');git(fixture,'clone',remote,other);configure(other);
  if(sparse){git(agent,'sparse-checkout','init','--no-cone');execFileSync('git',['sparse-checkout','set','--no-cone','--stdin'],{cwd:agent,input:'/seed.txt\n/web/collection-ledger.json\n/web/paid-evidence.json\n',stdio:['pipe','pipe','pipe']});git(agent,'update-index','--no-skip-worktree',cacheFile);}
  for(const[dir,id,credits]of[[agent,'ms-source',2],[other,'bm-source',1]])await fs.writeFile(path.join(dir,'web/collection-ledger.json'),JSON.stringify({periods:{'2026-11':{used:100+credits,runs:[{key:id,credits,receipt:{id},completedAt:'2026-11-24T22:00:00Z'}],reservations:{}}}}));
  await fs.writeFile(path.join(agent,'web/paid-evidence.json'),'exact already collected source');git(agent,'add','--sparse','--','web/collection-ledger.json','web/paid-evidence.json');git(agent,'commit','-m','source evidence before shared cache');await fs.writeFile(path.join(agent,cacheFile),cache([0,1]));
  await fs.writeFile(path.join(other,cacheFile),cache([0,2]));await fs.writeFile(path.join(other,'code.txt'),'keep independent code');git(other,'add','.');git(other,'commit','-m','concurrent source and cache');git(other,'push','origin','main');
  const output=execFileSync(process.execPath,[script],{cwd:agent,env:{...process.env,CONTROL_API_URL:'',CONTROL_TOKEN:'',GITHUB_RUN_ID:'test-local',GITHUB_JOB:'evidence'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert(output.includes('"evidenceSaved":true'));assert.equal(git(remote,'show','main:web/paid-evidence.json'),'exact already collected source');assert.equal(git(remote,'show','main:code.txt'),'keep independent code');
  const merged=JSON.parse(gunzipSync(execFileSync('git',['show','main:'+cacheFile],{cwd:remote})));assert.deepEqual(Object.keys(merged.entries).sort(),hashes);const ledger=JSON.parse(git(remote,'show','main:web/collection-ledger.json'));assert.equal(ledger.periods['2026-11'].used,103);assert.equal(ledger.periods['2026-11'].runs.length,2);
  console.log('PASS: successive source and binary-cache rebase conflicts preserve both collectors with sparse checkout '+sparse+' and no new source calls.');
 }finally{await fs.rm(fixture,{recursive:true,force:true});}
}
