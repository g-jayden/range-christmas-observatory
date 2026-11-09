import fs from 'node:fs/promises';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget} from '../server/credit-budget.mjs';
import {apiUrl,categories} from '../server/sync.mjs';
const policy={...await loadPolicy(),catalogueTransport:'enhanced-batch',browserCreditsPerRun:2,maxSessionSeconds:60,maxFallbackScrapesPerRun:1},budget=await openCreditBudget(policy);
let reader,error;const proof={success:false,verifiedAt:new Date().toISOString(),source:'fresh-official-catalogue-enhanced-batch',baselineModified:false,mailSent:false};
try{
 reader=await createFirecrawlBrowserReader({policy,budget:{...budget,limit:Math.min(3,budget.limit)}});
 const entries=[['christmas-decorations','94578',true],['christmas-lights','94579',true],...Object.entries(categories).slice(0,2)],rows=await reader.many(entries.map(([,id,facets])=>apiUrl(id,0,{in_stock_f:['true']},Boolean(facets))));
 proof.catalogues=rows.map((d,i)=>({category:entries[i][0],expected:d.totalResults,rows:d.products.length,unique:new Set(d.products.map(p=>p.sku)).size}));
 if(proof.catalogues.some(d=>!d.expected||d.rows!==Math.min(120,d.expected)||d.unique!==d.rows))throw Error('Live catalogue probe failed row-count verification');
 if(rows.slice(0,2).some(d=>!d.facets?.find(f=>f.id==='brand_f')?.options?.length))throw Error('Official large-catalogue brand facets missing');
 proof.success=true;
}catch(e){error=e;proof.sourceFailures=e.sourceFailures;proof.error=String(e.message).replace(/fc-[\w-]+/g,'[redacted]');}
finally{await reader?.close();proof.metrics=reader?.metrics()||{};await budget.settle({credits:proof.metrics.firecrawlCredits||0,receipt:proof.metrics.receipt,report:proof});await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/catalogue-transport-proof.json',JSON.stringify(proof,null,2));}
console.log(JSON.stringify(proof));if(error)process.exitCode=1;
