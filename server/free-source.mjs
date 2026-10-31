import {SourceError,parseSource} from './sync.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
async function cloudChrome(chromium){
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'range-public-source-'));
 const executable=process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':process.platform==='win32'?path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'):'/opt/google/chrome/chrome';
 const child=spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9222','--user-data-dir='+profile,'--no-first-run','--window-size=1440,1000','--lang=en-GB','about:blank'],{stdio:'ignore'});
 let launchError;child.on('error',e=>{launchError=e});
 try{
  for(let attempt=0;attempt<40;attempt++){
   if(launchError)throw launchError;
   try{const reply=await fetch('http://127.0.0.1:9222/json/version');if(reply.ok){const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');return {browser,context:browser.contexts()[0],cleanup:async()=>{child.kill();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{})}}}}catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Cloud Chrome did not start');
 }catch(e){child.kill();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});throw e}
}
const ALLOWED=['www.therange.co.uk','search-lon.therange.co.uk'];
export function sourceUrl(raw){
 const clean=String(raw).replace(/[\u0000-\u001f]/g,'-'),u=new URL(clean);
 if(u.protocol!=='https:'||!ALLOWED.includes(u.hostname))throw Error('Unsupported source URL');
 return u.href;
}
export function browserMarkdown({features,information,specs}){
 return '## Features\n\n'+features.map(s=>'- '+s).join('\n')+'\n\n## Information\n\n'+information+'\n\n## Specification\n\n'+specs.map(s=>'- '+s).join('\n')+'\n\nAdditional Information';
}
export async function createFreeReader({fetcher=fetch,browserFactory,concurrency=4,delayMs=750,maxPages=15000,headless=process.env.COLLECTION_HEADLESS==='true'}={}){
 if(!browserFactory&&process.env.GITHUB_ACTIONS==='true'&&process.env.COLLECTION_BROWSER_CHANNEL==='chrome')return (await import('./native-chrome.mjs')).createNativeChromeReader({concurrency,delayMs,maxPages});
 let browser,context,warm,cleanup,opened=0,cursor=0;const pages=[],waiters=[],blockedHosts=new Set,inflight=new Map;
 const metrics={provider:'self-hosted-browser',firecrawlRequests:0,firecrawlCredits:0,directRequests:0,browserPages:0,screenshots:0,deduplicated:0};
 async function ensureBrowser(){
  if(!warm)warm=(async()=>{
   const factory=browserFactory||((await import('playwright')).chromium);
   if(!browserFactory&&process.env.GITHUB_ACTIONS==='true'&&process.env.COLLECTION_BROWSER_CHANNEL==='chrome')({browser,context,cleanup}=await cloudChrome(factory));
   else{browser=await factory.launch({headless,...(process.env.COLLECTION_BROWSER_CHANNEL?{channel:process.env.COLLECTION_BROWSER_CHANNEL}:{})});context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-GB'})}
   const page=await context.newPage();
   pages.push(page);
  })();
  await warm;
 }
 async function take(){await ensureBrowser();if(pages.length)return pages.pop();if(opened<concurrency-1){opened++;return context.newPage()}return new Promise(r=>waiters.push(r))}
 function release(page){const waiter=waiters.shift();if(waiter)waiter(page);else pages.push(page)}
 async function navigate(page,url){
  if(++cursor>maxPages)throw new SourceError('本轮浏览器任务量超过设定上限，等待续跑');
  metrics.browserPages++;const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  if(delayMs)await page.waitForTimeout(delayMs);
  return response;
 }
 async function fromBrowser(url,options,catalogue){
  const page=await take();
  try{
   const response=await navigate(page,url);
   if(catalogue){
    try{await page.waitForFunction(()=>{try{return Array.isArray(JSON.parse(document.body.innerText).products)}catch{return false}},null,{timeout:45000})}
    catch(e){throw new SourceError(`官网目录未返回JSON HTTP ${response?.status()}: ${await page.title()}; ${(await page.locator('body').innerText()).slice(0,300)}`)}
    const text=await page.locator('body').innerText();JSON.parse(text);
    return {success:true,data:{rawHtml:text,metadata:{statusCode:200,sourceURL:url,provider:'native-browser'}}};
   }
   await page.waitForSelector('#product-dyn-code',{timeout:45000});
   const expected=new URL(url).hash.slice(1).replace(/^0+(?=\d)/,'');
   if(expected)await page.waitForFunction(sku=>(document.querySelector('#product-dyn-code')?.textContent||'').trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'')===sku,expected,{timeout:12000}).catch(()=>{});
   await page.waitForSelector('#product-dyn-specification-ul li',{timeout:20000});
   const fields=await page.evaluate(()=>({features:Array.from(document.querySelectorAll('#product-dyn-features-ul li')).map(e=>e.innerText.trim().replace(/\s+/g,' ')),information:document.querySelector('#product-description')?.innerText||'',specs:Array.from(document.querySelectorAll('#product-dyn-specification-ul li')).map(e=>e.innerText.trim().replace(/\s+/g,' '))}));
   const rawHtml=await page.content(),data={rawHtml,markdown:browserMarkdown(fields),metadata:{statusCode:200,initialHttpStatus:response?.status()||200,sourceURL:page.url(),provider:'native-browser',renderedProductSection:true}};
   if(options.formats?.some(f=>f==='screenshot'||f?.type==='screenshot')){
    const section=page.locator('#variant_container');await section.scrollIntoViewIfNeeded();
    const bytes=await section.screenshot({type:'png',timeout:45000});data.screenshotBase64=bytes.toString('base64');metrics.screenshots++;
   }
   return {success:true,data};
  }finally{release(page)}
 }
 async function raw(input,options={}){
  const url=sourceUrl(input),u=new URL(url),catalogue=u.pathname==='/api/productlist';
  const key=JSON.stringify({url,formats:options.formats||['rawHtml']});
  if(inflight.has(key)){metrics.deduplicated++;return inflight.get(key)}
  const run=async()=>{
   if(catalogue&&!blockedHosts.has(u.hostname)){
    metrics.directRequests++;
    try{const r=await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});const text=await r.text();if(r.ok){const body={success:true,data:{rawHtml:text,metadata:{statusCode:r.status,sourceURL:url,provider:'direct-http'}}};parseSource(body);return body}blockedHosts.add(u.hostname)}catch{blockedHosts.add(u.hostname)}
   }
   return fromBrowser(url,options,catalogue);
  };
  const promise=run();inflight.set(key,promise);
  try{return await promise}catch(e){inflight.delete(key);throw e}finally{if(catalogue)inflight.delete(key)}
 }
 const reader=async url=>parseSource(await raw(url));reader.raw=raw;
 reader.metrics=()=>({...metrics});reader.close=async()=>{try{if(browser)await browser.close()}finally{await cleanup?.()}};
 return reader;
}
