import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {runUpdate} from '../server/update-daily.mjs';
const root=process.cwd(),original=await fs.readFile('web/catalogue.json','utf8');await fs.mkdir(path.join(root,'runtime'),{recursive:true});const dir=await fs.mkdtemp(path.join(root,'runtime','free-retention-'));
await fs.mkdir(path.join(dir,'web'));await fs.writeFile(path.join(dir,'web/catalogue.json'),original);process.chdir(dir);
const oldMode=process.env.COLLECTION_MODE;process.env.COLLECTION_MODE='verify-all';
try{
 const r=await runUpdate({readerFactory:async()=>{throw Error('Free source temporarily unavailable')},budgetFactory:async()=>({limit:60,remaining:()=>60,settle:async()=>{}})});
 assert.equal(r.success,false);assert.equal(await fs.readFile('web/catalogue.json','utf8'),original);
 const status=JSON.parse(await fs.readFile('web/status.json','utf8'));assert.equal(status.firecrawlCredits,0);assert.equal(status.collectionAudit.paidFallback,false);assert.equal(status.lastSuccess,JSON.parse(original).observedAt);assert.equal(status.lastError.message,'Free source temporarily unavailable');
 console.log('PASS: failed initialization records zero usage and cannot fabricate fresh timestamps or overwrite a verified catalogue.');
}finally{process.chdir(root);if(oldMode===undefined)delete process.env.COLLECTION_MODE;else process.env.COLLECTION_MODE=oldMode;await fs.rm(dir,{recursive:true,force:true})}
