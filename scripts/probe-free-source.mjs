import fs from 'node:fs/promises';
import {createFreeReader} from '../server/free-source.mjs';
import {apiUrl} from '../server/sync.mjs';
import {parseDetails} from '../server/details.mjs';
const reader=await createFreeReader();
let phase='catalogue',products=0;
await fs.mkdir('runtime',{recursive:true});
try{
 const category=await reader(apiUrl('2645121'));
 if(category.products.length!==category.totalResults||new Set(category.products.map(p=>p.sku)).size!==category.totalResults)throw Error('Free category completeness failed');
 products=category.totalResults;phase='product-details';
 console.log(JSON.stringify({phase:'catalogue',success:true,products,metrics:reader.metrics()}));
 await fs.writeFile('runtime/free-source-proof.json',JSON.stringify({success:false,catalogueSuccess:true,products,phase,metrics:reader.metrics(),verifiedAt:new Date().toISOString()},null,2));
 const product=category.products.find(p=>p.sku==='12776')||category.products[0],url='https://www.therange.co.uk/'+product.variantPath.replace('#','/#');
 const response=await reader.raw(url,{formats:['rawHtml','markdown',{type:'screenshot'}]});
 const detail=parseDetails(response,product.sku,url);
 if(!response.data.screenshotBase64)throw Error('Free screenshot was not generated');
 const metrics=reader.metrics();if(metrics.firecrawlRequests!==0||metrics.firecrawlCredits!==0)throw Error('Paid request detected');
 await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/free-source-proof.json',JSON.stringify({success:true,source:'native-browser',products:category.totalResults,sku:detail.sku,specifications:detail.specs,screenshotBytes:Buffer.from(response.data.screenshotBase64,'base64').length,metrics,verifiedAt:new Date().toISOString()},null,2));
 console.log(JSON.stringify({success:true,products:category.totalResults,sku:detail.sku,metrics}));
}catch(e){
 await fs.writeFile('runtime/free-source-proof.json',JSON.stringify({success:false,catalogueSuccess:products>0,products,phase,error:e.message,metrics:reader.metrics(),verifiedAt:new Date().toISOString()},null,2));throw e;
}finally{await reader.close()}
