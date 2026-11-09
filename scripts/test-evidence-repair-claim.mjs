import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'range-repair-claim-')),repo=path.join(dir,'collector'),origin=path.join(dir,'local-origin.git');
const env={...process.env,PATH:path.dirname(process.execPath)+':'+process.env.PATH,GITHUB_REPOSITORY:'g-jayden/range-christmas-observatory',GITHUB_RUN_ID:'999999',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'claim-fixture'};
const run=(bin,args)=>execFileSync(bin,args,{cwd:repo,env,stdio:'pipe',encoding:'utf8'});
try{
 await fs.mkdir(repo);await fs.mkdir(path.join(repo,'web'));await fs.mkdir(path.join(repo,'scripts'));await fs.symlink(path.join(root,'server'),path.join(repo,'server'),'dir');
 for(const p of ['claim-evidence-repair.mjs','push-evidence.mjs'])await fs.copyFile(path.join(root,'scripts',p),path.join(repo,'scripts',p));
 for(const p of ['notification-readiness','monitor-state','collection-ledger'])await fs.writeFile(path.join(repo,'web',p+'.json'),'{}');
 await fs.writeFile(path.join(repo,'web/evidence-repair-request.json'),JSON.stringify({state:'pending',scope:'current-product-evidence',requestId:'claim-fixture'}));
 execFileSync('git',['init','--bare',origin],{stdio:'pipe'});run('git',['init','-b','main']);run('git',['config','user.name','Local fixture']);run('git',['config','user.email','fixture@example.invalid']);run('git',['remote','add','origin',origin]);run('git',['add','.']);run('git',['commit','-m','Fixture']);run('git',['push','-u','origin','main']);
 // Reproduce the real preflight state: mail readiness changed a public file
 // after checkout, before the one-time repair claim is durably published.
 await fs.writeFile(path.join(repo,'web/notification-readiness.json'),'{"mailReady":true}');
 const yaml=await fs.readFile(path.join(root,'.github/workflows/daily-pages.yml'),'utf8'),step=yaml.split('      - name: Persist the one-time evidence repair claim before paid requests\n')[1]?.split('      - name:')[0];assert(step);const script=step.split('        run: |\n')[1].trimEnd().split('\n').map(s=>s.replace(/^          /,'')).join('\n');
 run('bash',['-e','-c',script]);assert.equal(run('git',['status','--porcelain']).trim(),'');
 const request=JSON.parse(run('git',['--git-dir='+origin,'show','main:web/evidence-repair-request.json']));assert.equal(request.state,'claimed');assert.equal(request.ownerRunId,'999999');assert.deepEqual(JSON.parse(run('git',['--git-dir='+origin,'show','main:web/notification-readiness.json'])),{mailReady:true});
 assert.throws(()=>run(process.execPath,['scripts/claim-evidence-repair.mjs']),'The same request cannot be claimed a second time');
 console.log('PASS: real workflow claim commits dirty readiness and repair ownership together; local-origin publication succeeds; duplicate claim rejected; no paid request or external network.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
