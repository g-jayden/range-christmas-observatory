import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'spring-pending-workflow-')),root=fileURLToPath(new URL('../',import.meta.url));
try{
 await fs.mkdir(path.join(dir,'web/spring'),{recursive:true});await fs.writeFile(path.join(dir,'web/spring/status.json'),JSON.stringify({ready:false,products:20,reviewPending:2}));
 const output=path.join(dir,'github-output'),stdout=execFileSync(process.execPath,[path.join(root,'scripts/sync-spring-service.mjs')],{cwd:dir,encoding:'utf8',env:{...process.env,GITHUB_OUTPUT:output,CONTROL_TOKEN:'',CONTROL_API_URL:''}});
 assert.equal((await fs.readFile(output,'utf8')).trim(),'ready=false');const result=JSON.parse(stdout.trim());assert.equal(result.activated,false);assert.equal(result.mailSent,false);
 const workflow=await fs.readFile(path.join(root,'.github/workflows/spring.yml'),'utf8');assert.match(workflow,/name: Save baseline state\n\s+if: steps\.spring-sync\.outputs\.ready == 'true'/);assert.match(workflow,/git add --sparse -- web\/spring web\/collection-ledger\.json/);
 console.log('PASS: pending Spring verification exits successfully without activation/email and skips baseline publication; completed baseline commits explicitly preserve the refreshed receipt ledger.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
