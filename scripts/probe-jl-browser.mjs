import fs from 'node:fs/promises';import {firefox} from '../runtime/jl-probe/node_modules/playwright/index.mjs';
// Production source compatibility test. A clean ordinary browser, no account,
// cookies imported from users, modified client identity, proxy or challenge solver.
await fs.mkdir('runtime/jl-browser-acceptance',{recursive:true});
// Chromium returned an HTTP2 transport error and HTTP1 timed out.
// Test a second official browser engine with its default protocol and identity.
const browser=await firefox.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();let result;
try{const response=await page.goto('https://www.johnlewis.com/browse/christmas/baubles-tree-decorations/_/N-54yc',{waitUntil:'domcontentloaded',timeout:45000});const status=response?.status()||0;
 if(status>=400)throw Error('Official browser source HTTP '+status);
 await page.locator('article[data-product-id]').first().waitFor({state:'visible',timeout:20000});
 result=await page.evaluate(()=>({title:document.title,heading:document.querySelector('h1')?.textContent?.trim(),count:document.body.innerText.match(/(\d+)\s*[-–]\s*(\d+)\s*of\s*([\d,]+)/)?.slice(1),rows:document.querySelectorAll('article[data-product-id]').length}));
 result={...result,status,observedAt:new Date().toISOString(),firecrawlCredits:0};
 await fs.writeFile('runtime/jl-browser-acceptance/first-page.html',await page.content());
 const detailResponse=await page.goto('https://www.johnlewis.com/john-lewis-felt-mouse-initial-tree-decoration/p115617144',{waitUntil:'domcontentloaded',timeout:45000});if(detailResponse?.status()!==200)throw Error('John Lewis product source HTTP '+detailResponse?.status());
 const productHtml=await page.content();await fs.writeFile('runtime/jl-browser-acceptance/product.html',productHtml);
 const scripts=[...productHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>/application\/(?:ld\+)?json/.test(m[1])).map(m=>{let data;try{data=JSON.parse(m[2])}catch{return {attributes:m[1],bytes:m[2].length,invalid:true};}const paths=[];const walk=(v,p,depth)=>{if(depth>5||paths.length>100)return;if(Array.isArray(v)){paths.push(p+'[length='+v.length+']');if(v.length)walk(v[0],p+'[]',depth+1);}else if(v&&typeof v==='object'){for(const k of Object.keys(v)){if(/key|token|cookie|session|personal|track/i.test(k))continue;paths.push(p+'.'+k);walk(v[k],p+'.'+k,depth+1);}}};walk(data,'root',0);return {attributes:m[1],bytes:m[2].length,paths};});console.log(JSON.stringify({phase:'John Lewis public source schema',status:detailResponse.status(),scripts,firecrawlCredits:0}));
}catch(e){result={complete:false,error:e.message,observedAt:new Date().toISOString(),firecrawlCredits:0};}finally{await browser.close();}
await fs.writeFile('runtime/jl-browser-acceptance/status.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
