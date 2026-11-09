import fs from 'node:fs/promises';
import {atomicJson} from '../server/sync.mjs';
const p=JSON.parse(await fs.readFile('web/evidence-repair-request.json','utf8'));
if(p.state!=='pending'||p.scope!=='current-product-evidence'||process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||''))throw Error('Unapproved or previously claimed evidence repair');
await atomicJson('web/evidence-repair-request.json',{...p,state:'claimed',ownerRunId:process.env.GITHUB_RUN_ID,claimedAt:new Date().toISOString()});
console.log(JSON.stringify({phase:'claim-existing-product-evidence',requestId:p.requestId,sourceRequestsMade:false,firecrawlCredits:0}));
