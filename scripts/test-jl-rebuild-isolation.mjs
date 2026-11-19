import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'jl-rebuild-isolation-'));
try{
 await fs.mkdir(tmp+'/web/jl',{recursive:true});await fs.writeFile(tmp+'/web/jl/catalogue.json',JSON.stringify({products:[],lastCompleteAt:'2026-11-18T22:00:00Z'}));await fs.writeFile(tmp+'/web/jl/source-directory.json',JSON.stringify({complete:false,observedAt:'2026-11-19T00:00:00Z',families:{},failures:[{error:'incomplete fixture'}],firecrawlCredits:9,sourceRequests:16}));
 await fs.writeFile(tmp+'/no-network.mjs',`globalThis.fetch=()=>{throw Error('REBUILD_MUST_NOT_REQUEST_SOURCE')};`);
 const r=spawnSync(process.execPath,['--import',tmp+'/no-network.mjs',fileURLToPath(new URL('./update-jl.mjs',import.meta.url))],{cwd:tmp,encoding:'utf8',env:{...process.env,JL_REBUILD_ONLY:'true',JL_RESUME_PAID:'false',FIRECRAWL_API_KEY:'fixture-not-a-secret'}});
 assert.notEqual(r.status,0);assert.match(r.stderr,/source remains incomplete/);assert.doesNotMatch(r.stderr,/REBUILD_MUST_NOT_REQUEST_SOURCE/);
 assert.equal(JSON.parse(await fs.readFile(tmp+'/web/jl/source-attempt.json')).firecrawlCredits,0);assert.equal(JSON.parse(await fs.readFile(tmp+'/web/jl/daily-error.json')).firecrawlCredits,0);await assert.rejects(fs.access(tmp+'/web/collection-ledger.json'));
 console.log('PASS: an incomplete JL saved-data rebuild fails honestly without source calls, paid fallback, copied historic charges or ledger mutation.');
}finally{await fs.rm(tmp,{recursive:true,force:true});}
