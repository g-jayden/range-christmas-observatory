import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {runUpdate} from '../server/update-daily.mjs';
const root=process.cwd(),original=await fs.readFile('web/catalogue.json','utf8');await fs.mkdir(path.join(root,'runtime'),{recursive:true});const dir=await fs.mkdtemp(path.join(root,'runtime','free-retention-'));
await fs.mkdir(path.join(dir,'web'));await fs.writeFile(path.join(dir,'web/catalogue.json'),original);process.chdir(dir);
try{
 const r=await runUpdate({readerFactory:async()=>{throw Error('Free source temporarily unavailable')}});
 assert.equal(r.success,false);assert.equal(await fs.readFile('web/catalogue.json','utf8'),original);
 const status=JSON.parse(await fs.readFile('web/status.json','utf8'));assert.equal(status.firecrawlCredits,0);assert.equal(status.collectionAudit.paidFallback,false);assert.equal(status.lastSuccess,JSON.parse(original).observedAt);assert(status.lastError);
 console.log('PASS: failed initialization records zero usage and cannot fabricate fresh timestamps or overwrite a verified catalogue.');
}finally{process.chdir(root)}
