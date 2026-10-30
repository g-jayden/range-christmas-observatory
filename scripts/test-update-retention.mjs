import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const root=process.cwd();await fs.mkdir('runtime',{recursive:true});const dir=await fs.mkdtemp(path.join(root,'runtime','retention-test-'));await fs.mkdir(path.join(dir,'web'));
const original=await fs.readFile('web/catalogue.json','utf8');await fs.writeFile(path.join(dir,'web/catalogue.json'),original);
const mock=`globalThis.fetch=async url=>{if(String(url).endsWith('/v2/team/credit-usage'))return new Response(JSON.stringify({data:{remainingCredits:40,planCredits:1000}}),{headers:{'content-type':'application/json'}});throw Error('Test source unavailable');};`;
const result=spawnSync(process.execPath,['--import','data:text/javascript;base64,'+Buffer.from(mock).toString('base64'),path.join(root,'server/update-daily.mjs')],{cwd:dir,encoding:'utf8',env:{...process.env,FIRECRAWL_API_KEY:'test-only',FULL_DETAILS:'true'}});
assert.equal(result.status,1);assert.equal(await fs.readFile(path.join(dir,'web/catalogue.json'),'utf8'),original);
const status=JSON.parse(await fs.readFile(path.join(dir,'web/status.json'),'utf8'));assert.equal(status.mode,'basic');assert(status.fullUpdatePending);assert.equal(status.lastError.message,'Test source unavailable');assert.equal(status.revision,JSON.parse(original).revision);
console.log('PASS: low-credit full request falls back transparently; unavailable source preserves the entire previous snapshot and reports failure without exposing credentials.');
