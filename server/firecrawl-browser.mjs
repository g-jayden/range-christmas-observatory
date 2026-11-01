import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SourceError,parseSource} from './sync.mjs';
import {sourceUrl} from './free-source.mjs';
import {budgetError} from './credit-budget.mjs';

async function readFamilyBundle({url,jsonUrl,initial,providedHtml}){
 const read=async(target,json)=>{try{const response=await fetch(target,{credentials:'include',cache:'no-store',headers:json?{'X-Requested-With':'XMLHttpRequest',accept:'application/json'}:undefined,signal:AbortSignal.timeout(20000)});if(response.status!==200)return {status:response.status};return {status:200,value:json?await response.json():await response.text()}}catch{return {status:0}}};
 const [data,html]=await Promise.all([initial?{status:200,value:initial}:read(jsonUrl,true),providedHtml?{status:200,value:providedHtml}:read(url,false)]);
 if(data.status!==200||html.status!==200)return {status:data.status!==200?data.status:html.status,jsonStatus:data.status,htmlStatus:html.status,jsonBody:data.value,html:html.value};
 const body=data.value,doc=new DOMParser().parseFromString(html.value,'text/html'),plain=html=>new DOMParser().parseFromString(String(html||''),'text/html').body.textContent.replace(/\s+/g,' ').trim();
 const description=doc.querySelector('#product-description')?.cloneNode(true);description?.querySelectorAll('a,script,style,#product-dyn-variant-desc').forEach(e=>e.remove());
 const sourceJson=text=>JSON.parse(text.replace(/[\u0000-\u001f]/g,' '));
 let product;for(const el of doc.querySelectorAll('script[type="application/ld+json"]')){try{const d=sourceJson(el.textContent);if(d['@type']==='Product')product=d}catch{}}
 let gtm,gtmId;for(const el of doc.querySelectorAll('script:not([src])')){const match=el.textContent.match(/(?:var\s+)?gtm_product_data\s*=\s*(\[[\s\S]*?\])\s*;/);if(match){gtmId=match[1].match(/["']prod_id["']\s*:\s*["']?(\d+)/)?.[1];try{gtm=sourceJson(match[1])}catch{}}}
 const offers=product?.offers?.offers||[product?.offers];
 const evidence={url,jsonUrl,productId:doc.querySelector('#product_id')?.value||gtm?.[0]?.prod_id||gtmId||null,title:doc.title,features:Array.from(doc.querySelectorAll('#product-dyn-features-ul li')).map(e=>plain(e.textContent)),information:description?plain(description.textContent):'',offers:offers.filter(Boolean).map(o=>({sku:String(o.sku),image:o.image?.url||null})),gallery:Array.from(doc.querySelectorAll('img[data-variant]')).map(e=>({url:e.getAttribute('src'),variants:(e.getAttribute('data-variant')||'').split(',').filter(Boolean)}))};
 const originalGallery=Array.from(doc.querySelectorAll('#product-gallery .rsImg')).map(e=>({url:e.getAttribute('href')||e.getAttribute('data-rsBigImg')||e.getAttribute('src'),thumbnail:e.querySelector('img[data-variant]')?.getAttribute('src')||e.getAttribute('data-rsTmb'),variants:(e.querySelector('img[data-variant]')?.getAttribute('data-variant')||e.getAttribute('data-variant')||'').split(',').filter(Boolean)})).filter(g=>g.url&&/\/media\//.test(g.url));
 const rawGallery=product?.image?.url||product?.image||[];evidence.originalGallery=originalGallery;evidence.structuredOriginalImages=(Array.isArray(rawGallery)?rawGallery:[rawGallery]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean);
 const variants=Array.isArray(body.variant_arr)?body.variant_arr.map(v=>({code:v.code,prod_id:v.prod_id,sku:v.sku,id:v.id,attributes:v.attributes,attributes_supplementary:{'Model Number':v.attributes_supplementary?.['Model Number']},product_specification:v.product_specification||[],features:v.features||[],desc_override:v.desc_override,descriptionText:plain(v.description_html)})):[];
 return {status:200,variants,evidence};
}

async function readImageBatch(items){
    let cursor=0;const results=[];await Promise.all(Array.from({length:8},async()=>{while(cursor<items.length){const {url,prior,hashOnly}=items[cursor++];let debug;try{
     const headers={accept:'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'};if(prior?.etag)headers['if-none-match']=prior.etag;else if(prior?.lastModified)headers['if-modified-since']=prior.lastModified;
     const response=await fetch(url,{credentials:'include',headers,cache:'no-cache',signal:AbortSignal.timeout(8000)});
     if(response.status===304&&prior?.hash){results.push({...prior,url,ok:true,revalidated:true});continue;}
     if(response.status!==200||!response.headers.get('content-type')?.startsWith('image/')){results.push({url,ok:false,status:response.status,error:response.status===403?'access-blocked':'not-an-image'});continue;}
     const blob=await response.blob();debug={mime:blob.type,size:blob.size,magic:Array.from(new Uint8Array(await blob.slice(0,16).arrayBuffer()))};let width,height;
     try{const bitmap=await createImageBitmap(blob);width=bitmap.width;height=bitmap.height;bitmap.close();}
     catch{const objectUrl=URL.createObjectURL(blob);try{const image=new Image();image.src=objectUrl;await image.decode();width=image.naturalWidth;height=image.naturalHeight;}finally{URL.revokeObjectURL(objectUrl)}}
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
     const same=prior?.hash===hash&&prior?.cachedImageUrl;let dataBase64;if(!same&&!hashOnly){let binary='';const bytes=new Uint8Array(await blob.arrayBuffer());for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));dataBase64=btoa(binary);}
     results.push({url,ok:width>=64&&height>=64,error:width<64||height<64?'placeholder-too-small':undefined,width,height,hash,bytes:blob.size,mime:blob.type,dataBase64,cachedImageUrl:same?prior.cachedImageUrl:undefined,needsBody:!same&&hashOnly,etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified')});
    }catch(e){results.push({url,ok:false,debug,error:'image-fetch-or-decode-failed: '+String(e.message).slice(0,120)})}}}));return results;
   }

export async function createFirecrawlBrowserReader({policy,budget,fetcher=fetch,connect,now=()=>Date.now()}={}){
 const key=process.env.FIRECRAWL_API_KEY;if(!key)throw new SourceError('Firecrawl服务器密钥尚未配置',401);
 let session,browser,context,starting,closed=false,created=0,deadline=0,allocatedPages=0,browserReceipt,sessionClosed=false,browserEndedAt=0;
 const pages=[],waiting=[],families=new Map(),familyFailures=new Map(),active=new Map();
 const parallel=policy.browserConcurrency||4,ttl=Math.min(1800,policy.maxSessionSeconds||1800,Math.floor(Math.min(budget.limit,policy.browserCreditsPerRun||20)*30));
 const fallbackLimit=Math.max(0,Math.min(policy.maxFallbackScrapesPerRun??40,budget.limit-Math.ceil(ttl/30))),fallbackCache=new Map(),captureOriginals=new Map();let fallbackReserved=0,scrapeCredits=0,scrapeBillingVerified=true;
 if(ttl<60)throw budgetError('本轮积分不足以创建一个浏览器会话');
 const metrics={provider:'firecrawl-browser',billingMode:'code-session-time',firecrawlRequests:0,scrapeRequests:0,firecrawlCredits:0,creditsEstimatedUpperBound:ttl/30+fallbackLimit,browserCreditUpperBound:ttl/30,fallbackLimit,browserPages:0,familyReads:0,familyReuse:0,screenshots:0,sourceImageChecks:0};
 async function api(path,method,body){
  metrics.firecrawlRequests++;
  const response=await fetcher('https://api.firecrawl.dev/v2/'+path,{method,headers:{authorization:'Bearer '+key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(105000)});
  const result=await response.json();if(!response.ok||result.success===false)throw new SourceError('Firecrawl '+method+' 请求未成功 HTTP '+response.status,response.status);
  return result;
 }
 async function scrapeRaw(url){
  guard();if(fallbackCache.has(url))return fallbackCache.get(url);
  if(fallbackReserved>=fallbackLimit)throw budgetError('受阻地址的定额抓取已达本轮上限，未启动更多付费请求');
  fallbackReserved++;metrics.scrapeRequests++;
  const promise=(async()=>{
   let charged=false;try{
    const result=await api('scrape','POST',{url,formats:['rawHtml'],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},skipTlsVerification:false,parsers:[],timeout:45000});
    const cost=result.data?.metadata?.creditsUsed;
    scrapeCredits+=Number.isFinite(cost)?cost:1;charged=true;if(!Number.isFinite(cost))scrapeBillingVerified=false;
    if(!result.data?.rawHtml||result.data.metadata?.statusCode!==200)throw new SourceError('Firecrawl源站抓取失败 HTTP '+result.data?.metadata?.statusCode,result.data?.metadata?.statusCode||0);
    return result.data.rawHtml;
   }catch(error){if(!charged){scrapeCredits++;scrapeBillingVerified=false}throw error}
  })();fallbackCache.set(url,promise);return promise;
 }

 async function scriptAction(script){
  guard();if(fallbackReserved>=fallbackLimit)throw budgetError('批量核验已达到本轮付费请求上限');fallbackReserved++;metrics.scrapeRequests++;
  let charged=false;try{
   const result=await api('scrape','POST',{url:'https://www.therange.co.uk/p/deluxe-pre-lit-pop-up-tree-6ft/p12776/#12776',formats:['rawHtml',{type:'screenshot',fullPage:false}],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},skipTlsVerification:false,blockAds:false,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script}]});
   const cost=result.data?.metadata?.creditsUsed;scrapeCredits+=Number.isFinite(cost)?cost:1;charged=true;if(!Number.isFinite(cost))scrapeBillingVerified=false;
   if(result.data?.metadata?.statusCode!==200)throw new SourceError('图片批量核验入口失败 HTTP '+result.data?.metadata?.statusCode,result.data?.metadata?.statusCode||0);
   let value=result.data?.actions?.javascriptReturns?.[0]?.value;if(typeof value==='string')value=JSON.parse(value);
   if(!Array.isArray(value))throw Error('批量核验没有返回结构化结果');
   return value;
  }catch(e){if(!charged){scrapeCredits++;scrapeBillingVerified=false;}throw e;}
 }

 function guard(){if(closed||deadline&&now()+30000>=deadline)throw budgetError('本轮浏览器运行时间已达到积分硬上限，已停止新增请求');}
 async function start(){
  if(sessionClosed)throw Error('本轮浏览器已完成并关闭，不能重新创建付费会话');
  if(!starting)starting=(async()=>{
   guard();created=now();deadline=created+ttl*1000;
   try{session=await api('interact','POST',{ttl,activityTtl:120,streamWebView:false,blockAds:policy.blockAds===true,location:{country:'US'}});}
   catch(error){metrics.creationUncertain=![400,401,402,403,429].includes(error.status);throw error;}
   if(!session.id||!session.cdpUrl)throw Error('Firecrawl没有返回浏览器会话');
   try{browser=await(connect||(async url=>(await import('playwright')).chromium.connectOverCDP(url)))(session.cdpUrl);}
   catch{throw Error('Firecrawl浏览器连接失败；会话将立即关闭');}
   context=browser.contexts()[0]||await browser.newContext({viewport:{width:1440,height:1000},locale:'en-GB'});await context.setExtraHTTPHeaders?.({'Cache-Control':'no-cache'});
  })();
  await starting;
 }
 async function take(){await start();guard();if(pages.length)return pages.pop();if(allocatedPages<parallel){allocatedPages++;return context.newPage()}return new Promise((resolve,reject)=>waiting.push({resolve,reject}))}
 function release(page){const waiter=waiting.shift();if(waiter)waiter.resolve(page);else pages.push(page)}
 async function navigate(page,url){guard();metrics.browserPages++;const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});if(!response||response.status()>=400)throw new SourceError('官网请求失败 HTTP '+(response?.status()||0)+' '+new URL(url).pathname,response?.status()||0);return response;}
 async function jsonPage(page,url){await navigate(page,url);let text;try{text=await page.locator('body').innerText();return JSON.parse(text)}catch{throw new SourceError('官网未返回可验证的JSON：'+await page.title(),/Just a moment|security verification/i.test(text||'')?403:0)}}
 async function familyFor(input){
  const u=new URL(input);u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');const canonical=u.href;
  if(families.has(canonical)){metrics.familyReuse++;return families.get(canonical)}
  if(familyFailures.has(canonical))throw familyFailures.get(canonical);
  const promise=(async()=>{
   const page=await take();try{
    const jsonUrl=canonical+'?json';
    let initial;
    if(!page.url().startsWith('https://www.therange.co.uk/')){
     try{initial=await jsonPage(page,jsonUrl)}catch(e){if([400,404].includes(e.status))throw e;initial=JSON.parse(await scrapeRaw(jsonUrl));}
    }
    let bundle=await page.evaluate(readFamilyBundle,{url:canonical,jsonUrl,initial});
    if([400,404].includes(bundle.jsonStatus)||[400,404].includes(bundle.htmlStatus))throw new SourceError('官网商品数据请求失败 HTTP 404',404);
    if(bundle.status!==200){
     const json=bundle.jsonStatus===200?bundle.jsonBody:JSON.parse(await scrapeRaw(jsonUrl));
     const html=bundle.htmlStatus===200?bundle.html:await scrapeRaw(canonical);
     bundle=await page.evaluate(readFamilyBundle,{url:canonical,jsonUrl,initial:json,providedHtml:html});
    }
    if(bundle.status!==200)throw new SourceError('官网商品数据请求失败 HTTP '+bundle.status,bundle.status);
    const {variants,evidence}=bundle;
    if(!variants.length||!evidence.productId)throw Error('商品系列身份核验未通过：'+evidence.title);
    evidence.observedAt=new Date(now()).toISOString();metrics.familyReads++;return {variants,evidence};
   }finally{release(page)}
  })();families.set(canonical,promise);return promise;
 }
 async function enhancedCapture(url,options={}){
  guard();if(fallbackReserved>=fallbackLimit)throw budgetError('新品截图已达到本轮付费上限');fallbackReserved++;metrics.scrapeRequests++;
  const expected=new URL(url).hash.slice(1).replace(/^0+(?=\d)/,'');let charged=false;
  const script='(async()=>{const preferred='+JSON.stringify(options.preferredThumbnail||null)+';const sku='+JSON.stringify(expected)+';if(typeof initJson!=="function")throw Error("Official product initializer missing");if(typeof g_variantArr==="undefined"||!g_variantArr.length){const data=await(await fetch("?json",{credentials:"include",cache:"no-store"})).json();initJson(data)}const v=g_variantArr.find(v=>String(v.sku)===sku);if(!v)throw Error("SKU not present");if((document.querySelector("#product-dyn-code")?.textContent||"").trim().replace(/^[PM]/i,"")!==sku)selectAttrFilterByVariant(v);if(preferred){const thumb=Array.from(document.querySelectorAll("#product-gallery .rsThumb img")).find(i=>i.src===preferred);thumb?.parentElement?.click();}const wait=async()=>{for(let n=0;n<30;n++){const selected=(document.querySelector("#product-dyn-code")?.textContent||"").trim().replace(/^[PM]/i,"").replace(/^0+(?=\\d)/,"");const images=Array.from(document.querySelectorAll("#variant_container img")).filter(i=>i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64);if(selected===sku&&images.length){document.querySelector("#variant_container").scrollIntoView();const root=document.querySelector("#product-gallery .rsOverflow"),box=root?.getBoundingClientRect();const originals=Array.from(document.querySelectorAll("#product-gallery .rsMainSlideImage")).filter(i=>i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64).map(i=>{const r=i.getBoundingClientRect();const area=box?Math.max(0,Math.min(r.right,box.right)-Math.max(r.left,box.left))*Math.max(0,Math.min(r.bottom,box.bottom)-Math.max(r.top,box.top)):0;return {url:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight,visibleArea:area,selectedSku:selected}}).filter(i=>i.visibleArea>0).sort((a,b)=>b.visibleArea-a.visibleArea);return {sku:selected,images:images.length,originals}}await new Promise(r=>setTimeout(r,300))}throw Error("Selected SKU or real product image not ready")};return await wait()})()';
  try{
   const response=await api('scrape','POST',{url,formats:['rawHtml',{type:'screenshot',fullPage:false}],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},blockAds:false,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script}]});
   const cost=response.data?.metadata?.creditsUsed;scrapeCredits+=Number.isFinite(cost)?cost:1;charged=true;if(!Number.isFinite(cost))scrapeBillingVerified=false;
   let proof=response.data?.actions?.javascriptReturns?.[0]?.value;if(typeof proof==='string')proof=JSON.parse(proof);
   if(response.data?.metadata?.statusCode!==200||proof?.sku!==expected||!proof.images||!response.data.screenshot)throw Error('Enhanced selected-SKU screenshot evidence failed');
   captureOriginals.set(sourceUrl(url),proof.originals||[]);
   const target=new URL(response.data.screenshot);if(target.protocol!=='https:')throw Error('Screenshot must use HTTPS');
   const image=await fetcher(target.href,{signal:AbortSignal.timeout(30000)});if(!image.ok||!image.headers.get('content-type')?.startsWith('image/'))throw Error('Screenshot image unavailable');
   const bytes=Buffer.from(await image.arrayBuffer());if(bytes.length<2000||bytes.length>5000000)throw Error('Screenshot image size invalid');metrics.screenshots++;return bytes.toString('base64');
  }catch(e){if(!charged){scrapeCredits++;scrapeBillingVerified=false;}throw e;}
 }
 async function capture(url,family){
  const expected=new URL(url).hash.slice(1).replace(/^0+(?=\d)/,''),page=await take();try{
   await navigate(page,url);
   await page.waitForSelector('#product-dyn-code',{timeout:12000});
   if((await page.locator('#product-dyn-code').innerText()).trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'')!==expected){
    // Retry the retailer's own failed AJAX initialization, without inventing DOM data.
    await page.evaluate(async sku=>{
     if(typeof initJson!=='function')return;
     if(typeof g_variantArr==='undefined'||!g_variantArr.length){const data=await(await fetch('?json',{credentials:'include'})).json();initJson(data)}
     const variant=g_variantArr.find(v=>String(v.sku)===sku);if(variant&&typeof selectAttrFilterByVariant==='function')selectAttrFilterByVariant(variant);
    },expected);
   }
   await page.waitForFunction(sku=>(document.querySelector('#product-dyn-code')?.textContent||'').trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'')===sku,expected,{timeout:10000});
   const image=family.evidence.offers.find(o=>o.sku===expected)?.image;
   if(image)await page.waitForFunction(url=>Array.from(document.images).some(i=>i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64&&(i.currentSrc===url||i.src===url)),image,{timeout:12000});
   const section=page.locator('#variant_container');await section.scrollIntoViewIfNeeded();const bytes=await section.screenshot({type:'png',timeout:20000});metrics.screenshots++;return bytes.toString('base64');
  }finally{release(page)}
 }
 async function raw(input,options={}){
  const url=sourceUrl(input),u=new URL(url),catalogue=u.pathname==='/api/productlist';
  const identifier=JSON.stringify({url,formats:options.formats||[]});if(active.has(identifier))return active.get(identifier);
  const promise=(async()=>{
   if(catalogue){const page=await take();try{let body;try{body=await jsonPage(page,url)}catch(e){if([400,404].includes(e.status))throw e;body=JSON.parse(await scrapeRaw(url));}return {success:true,data:{rawHtml:JSON.stringify(body),metadata:{statusCode:200,sourceURL:url,provider:'firecrawl-browser'}}}}finally{release(page)}}
   const family=await familyFor(url),sku=u.hash.slice(1).replace(/^0+(?=\d)/,''),variant=family.variants.find(v=>String(v.sku).replace(/^0+(?=\d)/,'')===sku);
   if(!variant)throw Error('官网商品JSON没有请求的具体SKU：'+sku);
   const data={sourceVariant:variant,familyEvidence:family.evidence,metadata:{statusCode:200,sourceURL:url,provider:'firecrawl-browser'}};
   if(options.formats?.some(f=>f==='screenshot'||f?.type==='screenshot'))data.screenshotBase64=await capture(url,family).catch(()=>enhancedCapture(url));
   return {success:true,data};
  })();active.set(identifier,promise);try{return await promise}finally{active.delete(identifier)}
 }
 const reader=async url=>parseSource(await raw(url));reader.raw=raw;
 reader.captureVerified=enhancedCapture;reader.originalsFor=url=>captureOriginals.get(sourceUrl(url))||[];
 reader.familyReady=input=>{const u=new URL(sourceUrl(input));u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');return families.has(u.href)};
 reader.prepareFamilies=async products=>{
  const urls=[...new Set(products.map(p=>{const u=new URL(sourceUrl(p.sourceUrl));u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');return u.href}))];
  if(!urls.length)return;for(let offset=0;offset<urls.length;offset+=100){const batchUrls=urls.slice(offset,offset+100);
  const script='(async()=>{const read='+readFamilyBundle.toString()+';const urls='+JSON.stringify(batchUrls)+';let cursor=0;const results=[];await Promise.all(Array.from({length:4},async()=>{while(cursor<urls.length){const url=urls[cursor++];try{results.push({url,bundle:await read({url,jsonUrl:url+"?json"})})}catch(e){results.push({url,error:e.message})}}}));return results})()';
  const results=await scriptAction(script);
  if(results.length!==batchUrls.length||results.some(r=>!batchUrls.includes(r.url)))throw Error('商品系列批量补查地址不一致');
  for(const r of results){const b=r.bundle;if(b?.status===200&&b.variants?.length&&b.evidence?.productId){b.evidence.observedAt=new Date(now()).toISOString();b.evidence.sourceTransport='enhanced-batch';families.set(r.url,Promise.resolve({variants:b.variants,evidence:b.evidence}));metrics.familyReads++;}else {const error=new SourceError('官网商品详情链接异常，未返回可核实的具体SKU规格；本轮目录价格、库存、NEW与图片独立更新',b?.status||0);familyFailures.set(r.url,error);console.error(JSON.stringify({phase:'family-batch-failure',url:r.url,status:b?.status,jsonStatus:b?.jsonStatus,htmlStatus:b?.htmlStatus,variants:b?.variants?.length,productId:b?.evidence?.productId,error:r.error}));}}}
 };
 reader.auditImages=async (products,previous={},options={})=>{
  const allUrls=[...new Set(products.map(p=>p.variantImageUrl||p.imageUrl).filter(Boolean))],results=[],known=[],newUrls=[],validPrior={};
  for(const url of allUrls){
   const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.therange.co.uk'||!u.pathname.startsWith('/media/'))throw Error('商品图片来源未通过核验');
   const old=previous.entries?.[url];let valid=false;if(old?.ok&&old.width>=64&&old.height>=64&&/^images\/source\/[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(old.cachedImageUrl||'')){try{valid=createHash('sha256').update(await fs.readFile('web/'+old.cachedImageUrl)).digest('hex')===old.hash;}catch{}}
   if(valid){validPrior[url]={hash:old.hash,cachedImageUrl:old.cachedImageUrl,etag:old.etag,lastModified:old.lastModified,width:old.width,height:old.height,bytes:old.bytes,mime:old.mime};if(policy.repairImagesOnly)results.push({...old,observedAt:old.observedAt||previous.observedAt,retained:true});else known.push(url);}else newUrls.push(url);
  }
  const tasks=[];for(let offset=0;offset<known.length;offset+=400)tasks.push({urls:known.slice(offset,offset+400),hashOnly:true});
  for(let offset=0;offset<newUrls.length;){const size=policy.imageBatchProbe&&offset===0?3:Math.min(200,options.bodyBatchSize||200);tasks.push({urls:newUrls.slice(offset,offset+size),hashOnly:false});offset+=size;}
  await fs.mkdir('web/images/source',{recursive:true});let rechecked=0,changed=0;
  for(let taskIndex=0;taskIndex<tasks.length;taskIndex++){
   guard();const task=tasks[taskIndex],items=task.urls.map(url=>({url,prior:validPrior[url],hashOnly:task.hashOnly}));metrics.imageBatchRequests=(metrics.imageBatchRequests||0)+1;
   const batch=await scriptAction('('+readImageBatch.toString()+')('+JSON.stringify(items)+')');
   if(batch.length!==items.length||batch.some(r=>!items.some(i=>i.url===r.url)))throw Error('图片批量核验没有返回全部请求地址');
   if(taskIndex===0&&batch.filter(r=>!r.ok||r.width<64||r.height<64).length>batch.length*.8)throw Error('图片主通道未通过，停止后续付费批次');
   rechecked+=batch.length;const needsBody=[];
   for(const item of batch){
    item.observedAt=new Date(now()).toISOString();if(item.width<64||item.height<64){item.ok=false;item.error='placeholder-too-small'}
    if(item.ok&&item.needsBody){needsBody.push(item.url);changed++;continue;}
    if(item.ok)try{
     if(item.dataBase64){const bytes=Buffer.from(item.dataBase64,'base64');if(createHash('sha256').update(bytes).digest('hex')!==item.hash)throw Error('image hash mismatch');const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'})[item.mime];if(!ext)throw Error('unsupported image type');item.cachedImageUrl='images/source/'+item.hash+'.'+ext;await fs.writeFile('web/'+item.cachedImageUrl,bytes);delete item.dataBase64;}
     if(!item.cachedImageUrl||!/^images\/source\/[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(item.cachedImageUrl))throw Error('image cache missing');
     const stored=await fs.readFile('web/'+item.cachedImageUrl);if(createHash('sha256').update(stored).digest('hex')!==item.hash)throw Error('cached image hash mismatch');
    }catch(e){delete item.dataBase64;item.ok=false;item.error=e.message;}
    results.push(item);
   }
   for(let offset=0;offset<needsBody.length;offset+=200)tasks.push({urls:needsBody.slice(offset,offset+200),hashOnly:false});
   console.log(JSON.stringify({phase:'image-verification',checked:results.length,total:allUrls.length,changed}));
  }
  const byUrl=new Map(results.map(r=>[r.url,r]));for(const p of products){const r=byUrl.get(p.variantImageUrl||p.imageUrl);if(r?.ok){p.cachedImageUrl=r.cachedImageUrl;p.imageCacheEvidence={sourceUrl:r.url,sha256:r.hash,observedAt:r.observedAt};}}
  metrics.sourceImageChecks+=rechecked;const loaded=results.filter(r=>r.ok).length;
  return {mode:'live-enhanced-batches-and-original-image-cache',checked:results.length,rechecked,retained:policy.repairImagesOnly?allUrls.length-newUrls.length:0,changed,loaded,failed:results.length-loaded,failures:results.filter(r=>!r.ok),entries:Object.fromEntries(results.filter(r=>r.ok).map(r=>[r.url,r])),observedAt:new Date(now()).toISOString(),perImageScrapeRequests:0,batchScrapeRequests:metrics.imageBatchRequests||0};
 };
 reader.metrics=()=>({...metrics,scrapeCredits,sessionSeconds:created?Math.ceil(((browserEndedAt||now())-created)/1000):0});
 reader.closeBrowser=async()=>{
  if(!session||sessionClosed)return;sessionClosed=true;
  try{if(session.id)browserReceipt=await api('interact/'+encodeURIComponent(session.id),'DELETE');}
  catch{metrics.closeReceiptUnavailable=true;}
  finally{await browser?.close().catch(()=>{});browserEndedAt=now();deadline=0;}
 };
 reader.close=async()=>{
  if(closed)return;closed=true;for(const waiter of waiting.splice(0))waiter.reject(budgetError('浏览器会话已关闭'));
  await reader.closeBrowser();
  if(session){metrics.browserCredits=Number.isFinite(browserReceipt?.creditsBilled)?browserReceipt.creditsBilled:ttl/30;metrics.scrapeCredits=scrapeCredits;metrics.firecrawlCredits=metrics.browserCredits+scrapeCredits;metrics.billingVerified=Number.isFinite(browserReceipt?.creditsBilled)&&scrapeBillingVerified;metrics.sessionDurationMs=browserReceipt?.sessionDurationMs;metrics.receipt={sessionId:session.id,creditsBilled:metrics.firecrawlCredits,browserCredits:metrics.browserCredits,scrapeCredits,billingVerified:metrics.billingVerified};}
  else {metrics.browserCredits=created&&metrics.creationUncertain?ttl/30:0;metrics.scrapeCredits=scrapeCredits;metrics.firecrawlCredits=metrics.browserCredits+scrapeCredits;metrics.billingVerified=!metrics.creationUncertain&&scrapeBillingVerified;metrics.receipt={creditsBilled:metrics.firecrawlCredits,browserCredits:metrics.browserCredits,scrapeCredits,billingVerified:metrics.billingVerified};}
  metrics.closed=true;
 };
 return reader;
}
