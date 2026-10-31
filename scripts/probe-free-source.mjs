import fs from 'node:fs/promises';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {openCreditBudget} from '../server/credit-budget.mjs';
import {apiUrl,categories,collectStableCategory} from '../server/sync.mjs';
import {parseDetails} from '../server/details.mjs';
const policy={...await loadPolicy(),maxSessionSeconds:120},budget=await openCreditBudget(policy);
let reader,proof={success:false,verifiedAt:new Date().toISOString()},error;
await fs.mkdir('runtime',{recursive:true});
try{
 reader=await createFirecrawlBrowserReader({policy,budget});
 const category=await reader(apiUrl('2645121'));
 if(category.products.length!==category.totalResults||new Set(category.products.map(p=>p.sku)).size!==category.totalResults)throw Error('Category completeness failed');
 const product=category.products.find(p=>p.sku==='12776')||category.products[0],url='https://www.therange.co.uk/'+product.variantPath.replace('#','/#');
 const response=await reader.raw(url,{formats:['rawHtml','markdown',{type:'screenshot'}]});
 const detail=parseDetails(response,product.sku,url);
 if(!response.data.screenshotBase64)throw Error('Exact SKU screenshot was not generated');
 const variantUrl='https://www.therange.co.uk/p/7ft-neo-scandinavian-tips-spruce-fir-artificial-christmas-tree/m2372015/#7305060';
 const variant=parseDetails(await reader.raw(variantUrl),'7305060',variantUrl);
 if(variant.specs.Design!=='Non-Flocked')throw Error('Exact variant specifications were not selected');
 const sourceChecks={};
 for(const [name,id]of Object.entries(categories)){const data=await collectStableCategory(id,reader);sourceChecks[name]={expected:data.audit.expected,unique:data.audit.unique,complete:data.audit.complete};console.log(JSON.stringify({phase:'category-proof',category:name,...sourceChecks[name]}));}
 proof={success:true,source:'firecrawl-browser',sourceChecks,sku:detail.sku,specifications:detail.specs,variantSku:variant.sku,variantSpecifications:variant.specs,screenshotBytes:Buffer.from(response.data.screenshotBase64,'base64').length,verifiedAt:new Date().toISOString()};
}catch(e){error=e;proof.error=e.message;console.error(e.message)}
finally{
 await reader?.close();proof.metrics=reader?.metrics()||{};
 await budget.settle({credits:proof.metrics.firecrawlCredits||0,receipt:proof.metrics.receipt||null,report:proof});
 await fs.writeFile('runtime/free-source-proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify(proof));if(error)process.exitCode=1;
