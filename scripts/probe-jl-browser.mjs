import fs from 'node:fs/promises';import {chromium} from '../runtime/jl-probe/node_modules/playwright/index.mjs';
// Production source compatibility test. A clean ordinary browser, no account,
// cookies imported from users, modified client identity, proxy or challenge solver.
await fs.mkdir('runtime/jl-browser-acceptance',{recursive:true});
// The previous run failed with ERR_HTTP2_PROTOCOL_ERROR, without an HTTP refusal.
// Disable only HTTP/2 for this bounded compatibility test; TLS checks remain on.
const browser=await chromium.launch({headless:true,args:['--disable-http2']});const context=await browser.newContext();const page=await context.newPage();let result;
try{const response=await page.goto('https://www.johnlewis.com/browse/christmas/baubles-tree-decorations/_/N-54yc',{waitUntil:'domcontentloaded',timeout:45000});const status=response?.status()||0;
 if(status>=400)throw Error('Official browser source HTTP '+status);
 await page.locator('article[data-product-id]').first().waitFor({state:'visible',timeout:20000});
 result=await page.evaluate(()=>({title:document.title,heading:document.querySelector('h1')?.textContent?.trim(),count:document.body.innerText.match(/(\d+)\s*[-–]\s*(\d+)\s*of\s*([\d,]+)/)?.slice(1),rows:document.querySelectorAll('article[data-product-id]').length}));
 result={...result,status,observedAt:new Date().toISOString(),firecrawlCredits:0};
 await fs.writeFile('runtime/jl-browser-acceptance/first-page.html',await page.content());
}catch(e){result={complete:false,error:e.message,observedAt:new Date().toISOString(),firecrawlCredits:0};}finally{await browser.close();}
await fs.writeFile('runtime/jl-browser-acceptance/status.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
