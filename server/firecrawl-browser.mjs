import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SourceError,parseSource,atomicJson} from './sync.mjs';
import {sourceUrl} from './free-source.mjs';
import {budgetError} from './credit-budget.mjs';
import {createCatalogueTransport} from './catalogue-transport.mjs';
import {readPreviewAssets} from './product-previews.mjs';

async function readFamilyBundle({url,jsonUrl,initial,providedHtml,timeoutMs=20000}){
 const read=async(target,json)=>{try{const response=await fetch(target,{credentials:'include',cache:'no-store',headers:json?{'X-Requested-With':'XMLHttpRequest',accept:'application/json'}:undefined,signal:AbortSignal.timeout(timeoutMs)});if(response.status!==200)return {status:response.status};return {status:200,value:json?await response.json():await response.text()}}catch(error){return {status:0,error:String(error.message).slice(0,180)}}};
 const [data,html]=await Promise.all([initial?{status:200,value:initial}:read(jsonUrl,true),providedHtml?{status:200,value:providedHtml}:read(url,false)]);
 if(data.status!==200||html.status!==200)return {status:html.status===404?404:data.status!==200?data.status:html.status,jsonStatus:data.status,htmlStatus:html.status,jsonError:data.error,htmlError:html.error,jsonBody:data.value,html:html.value};
 const body=data.value,doc=new DOMParser().parseFromString(html.value,'text/html'),plain=html=>new DOMParser().parseFromString(String(html||''),'text/html').body.textContent.replace(/\s+/g,' ').trim();
 const description=doc.querySelector('#product-description')?.cloneNode(true);description?.querySelectorAll('a,script,style,#product-dyn-variant-desc').forEach(e=>e.remove());
 const sourceJson=text=>JSON.parse(text.replace(/[\u0000-\u001f]/g,' '));
 let product;for(const el of doc.querySelectorAll('script[type="application/ld+json"]')){try{const d=sourceJson(el.textContent);if(d['@type']==='Product')product=d}catch{}}
 let gtm,gtmId;for(const el of doc.querySelectorAll('script:not([src])')){const match=el.textContent.match(/(?:var\s+)?gtm_product_data\s*=\s*(\[[\s\S]*?\])\s*;/);if(match){gtmId=match[1].match(/["']prod_id["']\s*:\s*["']?(\d+)/)?.[1];try{gtm=sourceJson(match[1])}catch{}}}
 const offers=product?.offers?.offers||[product?.offers];
 const evidence={url,jsonUrl,breadcrumbs:Array.from(doc.querySelectorAll('[itemtype$=\"BreadcrumbList\"] [itemprop=\"name\"],[class*=\"breadcrumb\"] a,[id*=\"breadcrumb\"] a')).map(e=>plain(e.textContent)),productId:doc.querySelector('#product_id')?.value||gtm?.[0]?.prod_id||gtmId||null,title:doc.title,features:Array.from(doc.querySelectorAll('#product-dyn-features-ul li')).map(e=>plain(e.textContent)),information:description?plain(description.textContent):'',offers:offers.filter(Boolean).map(o=>({sku:String(o.sku),image:o.image?.url||null})),gallery:Array.from(doc.querySelectorAll('img[data-variant]')).map(e=>({url:e.getAttribute('src'),variants:(e.getAttribute('data-variant')||'').split(',').filter(Boolean)}))};
 const originalGallery=Array.from(doc.querySelectorAll('#available-imgs a.rsImg, #product-gallery a.rsImg')).map(e=>({url:e.getAttribute('href')||e.getAttribute('data-rsBigImg')||e.getAttribute('src'),thumbnail:e.querySelector('img[data-variant]')?.getAttribute('src')||e.getAttribute('data-rsTmb'),variants:(e.querySelector('img[data-variant]')?.getAttribute('data-variant')||e.getAttribute('data-variant')||'').split(',').filter(Boolean)})).filter(g=>g.url&&/\/media\//.test(g.url));
 const rawGallery=product?.image?.url||product?.image||[];evidence.originalGallery=originalGallery;evidence.structuredOriginalImages=(Array.isArray(rawGallery)?rawGallery:[rawGallery]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean);
 const variants=Array.isArray(body.variant_arr)?body.variant_arr.map(v=>({code:v.code,prod_id:v.prod_id,sku:v.sku,id:v.id,attributes:v.attributes,attributes_supplementary:{'Model Number':v.attributes_supplementary?.['Model Number']},product_specification:v.product_specification||[],features:v.features||[],desc_override:v.desc_override,descriptionText:plain(v.description_html)})):[];
 return {status:200,variants,evidence};
}

export async function readExactVariantOriginal({sku,variantId,preferred}){
 const selected=(document.querySelector('#product-dyn-code')?.textContent||'').trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'');
 if(selected!==String(sku)||!variantId)return [];
 const candidates=Array.from(document.querySelectorAll('#available-imgs a.rsImg')).map(a=>({url:a.getAttribute('href')||a.getAttribute('data-rsBigImg'),thumbnail:a.querySelector('img[data-variant]')?.getAttribute('src'),variants:(a.querySelector('img[data-variant]')?.getAttribute('data-variant')||a.getAttribute('data-variant')||'').split(',')})).filter(a=>a.variants.includes(String(variantId))&&a.url&&/^https:\/\/www\.therange\.co\.uk\/media\//.test(a.url)).sort((a,b)=>Number(b.thumbnail===preferred)-Number(a.thumbnail===preferred));
 for(const item of candidates.slice(0,3))try{
  const r=await fetch(item.url,{credentials:'include',cache:'no-cache',signal:AbortSignal.timeout(15000)});if(r.status!==200||!r.headers.get('content-type')?.startsWith('image/'))continue;
  const bitmap=await createImageBitmap(await r.blob()),width=bitmap.width,height=bitmap.height;bitmap.close();
  if(width>=64&&height>=64)return [{url:item.url,width,height,selectedSku:selected,variantId:String(variantId),evidence:'official-exact-variant-gallery',visibleArea:0}];
 }catch{}
 return [];
}

async function readImageBatch(items){
    let cursor=0;const results=[],deadline=Date.now()+45000;await Promise.all(Array.from({length:8},async()=>{while(cursor<items.length&&Date.now()<deadline){const {url,prior,hashOnly}=items[cursor++];let debug;try{
     const headers={accept:'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'};if(prior?.etag)headers['if-none-match']=prior.etag;else if(prior?.lastModified)headers['if-modified-since']=prior.lastModified;
     const source=new URL(url),unpublished=source.hostname==='kube-media-unpublished.rstore.com',mirror=unpublished?new URL(source.pathname+source.search,'https://www.therange.co.uk').href:null;let retrievedFrom=prior?.retrievedFrom===mirror?mirror:url,response;
     const download=target=>fetch(target,{credentials:'include',headers,cache:'no-cache',signal:AbortSignal.timeout(20000)});
     try{response=await download(retrievedFrom)}catch(error){if(!unpublished||retrievedFrom===mirror)throw error;}
     // Only the identical retailer-published asset path on its verified public CDN.
     // No changed filenames, generated variants, private credentials or upscaling.
     if(unpublished&&retrievedFrom!==mirror&&(!response||response.status===403)){retrievedFrom=mirror;response=await download(mirror);}
     if(response.status===304&&prior?.hash){results.push({...prior,url,retrievedFrom,ok:true,revalidated:true});continue;}
     if(response.status!==200||!response.headers.get('content-type')?.startsWith('image/')){results.push({url,ok:false,status:response.status,error:response.status===403?'access-blocked':'not-an-image'});continue;}
     const blob=await response.blob();debug={mime:blob.type,size:blob.size,magic:Array.from(new Uint8Array(await blob.slice(0,16).arrayBuffer()))};let width,height;
     try{const bitmap=await createImageBitmap(blob);width=bitmap.width;height=bitmap.height;bitmap.close();}
     catch{const objectUrl=URL.createObjectURL(blob);try{const image=new Image();image.src=objectUrl;await image.decode();width=image.naturalWidth;height=image.naturalHeight;}finally{URL.revokeObjectURL(objectUrl)}}
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
     const same=prior?.hash===hash&&prior?.cachedImageUrl;let dataBase64;if(!same&&!hashOnly){let binary='';const bytes=new Uint8Array(await blob.arrayBuffer());for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));dataBase64=btoa(binary);}
     results.push({url,retrievedFrom,sourceAssetPath:source.pathname,ok:width>=64&&height>=64,error:width<64||height<64?'placeholder-too-small':undefined,width,height,hash,bytes:blob.size,mime:blob.type,dataBase64,cachedImageUrl:same?prior.cachedImageUrl:undefined,needsBody:!same&&hashOnly,etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified')});
    }catch(e){results.push({url,ok:false,debug,error:'image-fetch-or-decode-failed: '+String(e.message).slice(0,120)})}}}));while(cursor<items.length)results.push({url:items[cursor++].url,ok:false,deferred:true,error:"bounded image time limit"});return results;
   }

export async function createFirecrawlBrowserReader({policy,budget,fetcher=fetch,connect,now=()=>Date.now()}={}){
 const key=process.env.FIRECRAWL_API_KEY;if(!key)throw new SourceError('Firecrawl服务器密钥尚未配置',401);
 let session,browser,context,starting,closed=false,created=0,deadline=0,allocatedPages=0,browserReceipt,sessionClosed=false,browserEndedAt=0;const runDeadline=now()+(policy.maxRunSeconds||1800)*1000;
 const pages=[],waiting=[],families=new Map(),familyFailures=new Map(),partialFamilies=new Map(),active=new Map(),verifiedCaptures=new Map(),priorityRepairs=new Map(),nativeTransportFailures=new Set();
 const parallel=policy.browserConcurrency||4;let ttl=Math.min(1800,policy.maxSessionSeconds||1800,Math.floor(Math.min(budget.limit,policy.browserCreditsPerRun||20)*30));
 let fallbackLimit=Math.max(0,Math.min(policy.maxFallbackScrapesPerRun??40,budget.limit-Math.ceil(ttl/30))),fallbackCache=new Map(),captureOriginals=new Map();let fallbackReserved=0,scrapeCredits=0,scrapeBillingVerified=true;
 if(ttl<60)throw budgetError('本轮积分不足以创建一个浏览器会话');
 const metrics={provider:'firecrawl-browser',billingMode:'code-session-time',firecrawlRequests:0,scrapeRequests:0,firecrawlCredits:0,creditsEstimatedUpperBound:ttl/30+fallbackLimit,browserCreditUpperBound:ttl/30,fallbackLimit,browserPages:0,familyReads:0,familyReuse:0,screenshots:0,sourceImageChecks:0};
 async function api(path,method,body){
  for(let attempt=0;;attempt++){
   metrics.firecrawlRequests++;
   const response=await fetcher('https://api.firecrawl.dev/v2/'+path,{method,headers:{authorization:'Bearer '+key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(105000)});
   const result=await response.json();if(response.ok&&result.success!==false)return result;
   const detail=String(result.error?.message||result.error||result.message||result.code||'').replace(/fc-[\w-]+/g,'[redacted]');
   const proxyFailure=path==='scrape'&&response.status>=500&&/ERR_TUNNEL_CONNECTION_FAILED|internal proxy error/i.test(detail);
   if(proxyFailure&&attempt===0&&(metrics.proxyRetries||0)<2&&fallbackReserved<availableFallback()){
    guard();fallbackReserved++;metrics.scrapeRequests++;metrics.proxyRetries=(metrics.proxyRetries||0)+1;
    const cost=result.data?.metadata?.creditsUsed??result.metadata?.creditsUsed;scrapeCredits+=Number.isFinite(cost)?cost:1;
    if(!Number.isFinite(cost)){scrapeBillingVerified=false;metrics.unconfirmedProxyFailureCredits=(metrics.unconfirmedProxyFailureCredits||0)+1;}
    console.log(JSON.stringify({phase:'bounded-provider-proxy-retry',attempt:1,runRetries:metrics.proxyRetries,completedCataloguePagesRetained:true}));
    await new Promise(resolve=>setTimeout(resolve,1500));continue;
   }
   throw new SourceError('Firecrawl '+method+' 请求未成功 HTTP '+response.status+(detail?': '+detail.slice(0,180):''),response.status);
  }
 }

 function availableFallback(){if(policy.catalogueTransport==='enhanced-batch'&&!session&&!starting&&!sessionClosed)return Math.max(0,Math.min(policy.maxFallbackScrapesPerRun??40,budget.limit));return sessionClosed&&Number.isFinite(browserReceipt?.creditsBilled)?Math.max(0,Math.min(policy.maxFallbackScrapesPerRun??40,budget.limit-browserReceipt.creditsBilled)):fallbackLimit;}
 async function scrapeRaw(url,{fresh=false}={}){
  guard();if(fresh)fallbackCache.delete(url);if(fallbackCache.has(url))return fallbackCache.get(url);
  if(fallbackReserved>=availableFallback())throw budgetError('受阻地址的定额抓取已达本轮上限，未启动更多付费请求');
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

 async function scriptAction(script,{needsImages=false,entryUrl='https://www.therange.co.uk/p/deluxe-pre-lit-pop-up-tree-6ft/p12776/#12776'}={}){
  guard();if(fallbackReserved>=availableFallback())throw budgetError('批量核验已达到本轮付费请求上限');fallbackReserved++;metrics.scrapeRequests++;
  let charged=false;try{
   const result=await api('scrape','POST',{url:entryUrl,formats:needsImages?['rawHtml',{type:'screenshot',fullPage:false}]:['rawHtml'],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},skipTlsVerification:false,blockAds:false,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script}]});
   const cost=result.data?.metadata?.creditsUsed;scrapeCredits+=Number.isFinite(cost)?cost:1;charged=true;if(!Number.isFinite(cost))scrapeBillingVerified=false;
   if(result.data?.metadata?.statusCode!==200)throw new SourceError('图片批量核验入口失败 HTTP '+result.data?.metadata?.statusCode,result.data?.metadata?.statusCode||0);
   let value=result.data?.actions?.javascriptReturns?.[0]?.value;if(typeof value==='string')value=JSON.parse(value);
   if(!Array.isArray(value))throw Error('批量核验没有返回结构化结果');
   return value;
  }catch(e){if(!charged){scrapeCredits++;scrapeBillingVerified=false;}throw e;}
 }

 function guard(){if(closed||now()>=runDeadline||deadline&&now()+30000>=deadline)throw budgetError('本轮采集时间或积分已达上限；已保存进度，停止新增请求');}
 async function start(){
  if(sessionClosed)throw Error('本轮浏览器已完成并关闭，不能重新创建付费会话');
  if(!starting)starting=(async()=>{
   guard();if(policy.catalogueTransport==='enhanced-batch'){ttl=Math.min(ttl,Math.floor((budget.limit-fallbackReserved)*30));if(ttl<60)throw budgetError('剩余额度不足以开启浏览器；已保留目录结果，不超额创建会话');fallbackLimit=Math.max(0,Math.min(policy.maxFallbackScrapesPerRun??40,budget.limit-ttl/30));metrics.browserCreditUpperBound=ttl/30;metrics.fallbackLimit=fallbackLimit;}created=now();deadline=created+ttl*1000;
   try{session=await api('interact','POST',{ttl,activityTtl:120,streamWebView:false,blockAds:policy.blockAds===true,location:{country:'GB'}});}
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
  if(policy.nativeCaptureEnabled===false&&policy.catalogueTransport==='enhanced-batch'){
   await reader.prepareFamilies([{sourceUrl:input}]);
   if(families.has(canonical))return families.get(canonical);
   throw familyFailures.get(canonical)||new SourceError('Selected SKU family evidence is unavailable',503);
  }
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
  guard();if(fallbackReserved>=availableFallback())throw budgetError('新品截图已达到本轮付费上限');fallbackReserved++;metrics.scrapeRequests++;
  const expected=new URL(url).hash.slice(1).replace(/^0+(?=\d)/,'');let charged=false;
  let script='(async()=>{const preferred='+JSON.stringify(options.preferredThumbnail||null)+';const sku='+JSON.stringify(expected)+';const selectedSku=()=>(document.querySelector("#product-dyn-code")?.textContent||"").trim().replace(/^[PM]/i,"").replace(/^0+(?=\\d)/,"");let v=typeof g_variantArr!=="undefined"?g_variantArr.find(v=>String(v.sku)===sku):null;if(selectedSku()!==sku){for(let n=0;n<30&&typeof initJson!=="function";n++)await new Promise(r=>setTimeout(r,300));if(typeof initJson!=="function")throw Error("Official product initializer missing for SKU selection");if(typeof g_variantArr==="undefined"||!g_variantArr.length){const data=await(await fetch("?json",{credentials:"include",cache:"no-store"})).json();initJson(data)}v=g_variantArr.find(v=>String(v.sku)===sku);if(!v)throw Error("SKU not present");selectAttrFilterByVariant(v);}v||={id:null};if(preferred){const thumb=Array.from(document.querySelectorAll("#product-gallery .rsThumb img")).find(i=>i.src===preferred);thumb?.parentElement?.click();}const wait=async()=>{for(let n=0;n<30;n++){const selected=(document.querySelector("#product-dyn-code")?.textContent||"").trim().replace(/^[PM]/i,"").replace(/^0+(?=\\d)/,"");const images=Array.from(document.querySelectorAll("#variant_container img")).filter(i=>i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64);if(selected===sku&&images.length){document.querySelector("#variant_container").scrollIntoView();const root=document.querySelector("#product-gallery .rsOverflow"),box=root?.getBoundingClientRect();const originals=Array.from(document.querySelectorAll("#product-gallery .rsMainSlideImage")).filter(i=>i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64).map(i=>{const r=i.getBoundingClientRect();const area=box?Math.max(0,Math.min(r.right,box.right)-Math.max(r.left,box.left))*Math.max(0,Math.min(r.bottom,box.bottom)-Math.max(r.top,box.top)):0;return {url:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight,visibleArea:area,selectedSku:selected}}).filter(i=>i.visibleArea>0).sort((a,b)=>b.visibleArea-a.visibleArea);if(originals.length)return {sku:selected,images:images.length,originals};if(n%5===0){const thumbs=Array.from(document.querySelectorAll("#product-gallery .rsThumb img")).filter(i=>i.src!==preferred&&i.getBoundingClientRect().width>0&&(!i.getAttribute("data-variant")||i.getAttribute("data-variant").split(",").includes(String(v.id))));thumbs[Math.floor(n/5)]?.parentElement?.click();}}await new Promise(r=>setTimeout(r,300))}throw Error("Selected SKU or real product image not ready")};return await wait()})()';
  const canonical=new URL(url);canonical.hash='';canonical.search='';canonical.pathname=canonical.pathname.replace(/\/$/,'');
  const currentFamily=await families.get(canonical.href),exactVariant=(currentFamily?.variants||partialFamilies.get(canonical.href)?.jsonBody?.variant_arr||[]).find(v=>String(v.sku).replace(/^0+(?=\d)/,'')===expected);
  if(exactVariant?.id)script=script.replace('throw Error("Selected SKU or real product image not ready")',`const mapped=await (${readExactVariantOriginal.toString()})(${JSON.stringify({sku:expected,variantId:exactVariant.id,preferred:options.preferredThumbnail||null})});if(mapped.length)return {sku:selectedSku(),images:1,originals:mapped};throw Error("Selected SKU or real product image not ready")`);
  if(options.recoverFamily){const payload={url:canonical.href,jsonUrl:canonical.href+'?json',initial:partialFamilies.get(canonical.href)?.jsonBody};script=script.replace('return await wait()})()',`const proof=await wait();proof.familyBundle=await (${readFamilyBundle.toString()})({...${JSON.stringify(payload)},providedHtml:document.documentElement.outerHTML});return proof})()`);}
  try{
   const response=await api('scrape','POST',{url,formats:['rawHtml',{type:'screenshot',fullPage:false}],onlyMainContent:false,maxAge:0,waitFor:3000,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},blockAds:false,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script}]});
   const cost=response.data?.metadata?.creditsUsed;scrapeCredits+=Number.isFinite(cost)?cost:1;charged=true;if(!Number.isFinite(cost))scrapeBillingVerified=false;
   let proof=response.data?.actions?.javascriptReturns?.[0]?.value;if(typeof proof==='string')proof=JSON.parse(proof);
   if(response.data?.metadata?.statusCode!==200||proof?.sku!==expected||!proof.images||!proof.originals?.some(o=>o.selectedSku===expected&&o.width>=64&&o.height>=64)||!response.data.screenshot)throw Error('Enhanced selected-SKU screenshot evidence failed');
   captureOriginals.set(sourceUrl(url),proof.originals||[]);
   const bundle=proof.familyBundle;if(bundle?.status===200&&bundle.variants?.some(v=>String(v.sku)===expected)&&bundle.evidence?.productId){bundle.evidence.observedAt=new Date(now()).toISOString();bundle.evidence.sourceTransport='enhanced-visible-selected-SKU-page';families.set(canonical.href,Promise.resolve({variants:bundle.variants,evidence:bundle.evidence}));familyFailures.delete(canonical.href);metrics.familyReads++;}
   const target=new URL(response.data.screenshot);if(target.protocol!=='https:')throw Error('Screenshot must use HTTPS');
   const image=await fetcher(target.href,{signal:AbortSignal.timeout(30000)});if(!image.ok||!image.headers.get('content-type')?.startsWith('image/'))throw Error('Screenshot image unavailable');
   const bytes=Buffer.from(await image.arrayBuffer());if(bytes.length<2000||bytes.length>5000000)throw Error('Screenshot image size invalid');metrics.screenshots++;return bytes.toString('base64');
  }catch(e){if(!charged){scrapeCredits++;scrapeBillingVerified=false;}throw e;}
 }
 async function capture(url,family,options={}){
  const expected=new URL(url).hash.slice(1).replace(/^0+(?=\d)/,''),page=await take();try{
   metrics.browserPages++;const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});if(!response||response.status()>=400)throw new SourceError('Native product page HTTP '+(response?.status()||0),response?.status()||0);
   await page.waitForSelector('#product-dyn-code',{timeout:5000});
   if((await page.locator('#product-dyn-code').innerText()).trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'')!==expected){
    // Retry the retailer's own failed AJAX initialization, without inventing DOM data.
    await page.evaluate(async sku=>{
     if(typeof initJson!=='function')return;
     if(typeof g_variantArr==='undefined'||!g_variantArr.length){const data=await(await fetch('?json',{credentials:'include'})).json();initJson(data)}
     const variant=g_variantArr.find(v=>String(v.sku)===sku);if(variant&&typeof selectAttrFilterByVariant==='function')selectAttrFilterByVariant(variant);
    },expected);
   }
   await page.waitForFunction(sku=>(document.querySelector('#product-dyn-code')?.textContent||'').trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'')===sku,expected,{timeout:5000});
   if(options.preferredThumbnail)await page.evaluate(preferred=>{const thumb=Array.from(document.querySelectorAll('#product-gallery .rsThumb img')).find(i=>i.src===preferred);thumb?.parentElement?.click();},options.preferredThumbnail);
   const image=family?.evidence?.offers?.find(o=>o.sku===expected)?.image;
   if(image)await page.waitForFunction(url=>Array.from(document.images).some(i=>i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64&&(i.currentSrc===url||i.src===url)),image,{timeout:5000});
   const proof=await page.evaluate(sku=>{const selected=(document.querySelector('#product-dyn-code')?.textContent||'').trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'');const root=document.querySelector('#product-gallery .rsOverflow'),box=root?.getBoundingClientRect();const originals=Array.from(document.querySelectorAll('#product-gallery .rsMainSlideImage')).filter(i=>i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64).map(i=>{const r=i.getBoundingClientRect(),area=box?Math.max(0,Math.min(r.right,box.right)-Math.max(r.left,box.left))*Math.max(0,Math.min(r.bottom,box.bottom)-Math.max(r.top,box.top)):0;return {url:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight,visibleArea:area,selectedSku:selected}}).filter(i=>i.visibleArea>0).sort((a,b)=>b.visibleArea-a.visibleArea);return {sku:selected,originals};},expected);
   if(proof.sku!==expected||!proof.originals.length)throw Error('Native selected-SKU original image not visible');
   captureOriginals.set(sourceUrl(url),proof.originals);
   if(options.recoverFamily){const u=new URL(url);u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');const bundle=await page.evaluate('async payload=>{payload.providedHtml=document.documentElement.outerHTML;return await ('+readFamilyBundle.toString()+')(payload)}',{url:u.href,jsonUrl:u.href+'?json',initial:partialFamilies.get(u.href)?.jsonBody});if(bundle?.status===200&&bundle.variants?.some(v=>String(v.sku)===expected)&&bundle.evidence?.productId){bundle.evidence.observedAt=new Date(now()).toISOString();bundle.evidence.sourceTransport='native-visible-selected-SKU-page';families.set(u.href,Promise.resolve({variants:bundle.variants,evidence:bundle.evidence}));familyFailures.delete(u.href);metrics.familyReads++;}}
   const section=page.locator('#variant_container');await section.scrollIntoViewIfNeeded();const bytes=await section.screenshot({type:'png',timeout:20000});metrics.screenshots++;return bytes.toString('base64');
  }finally{release(page)}
 }
 const catalogueBatch=createCatalogueTransport(async(fn,urls)=>{metrics.catalogueBatchRequests=(metrics.catalogueBatchRequests||0)+1;metrics.catalogueRequests=(metrics.catalogueRequests||0)+urls.length;const rows=await scriptAction('('+fn.toString()+')('+JSON.stringify(urls)+')',{entryUrl:'https://www.therange.co.uk/p/deluxe-pre-lit-pop-up-tree-6ft/p12776/#12776'});console.log(JSON.stringify({phase:'catalogue-batch',requests:urls.length,failures:rows.filter(r=>r.status!==200||!r.body).map(({url,status,error,navigation})=>({url,status,error,navigation}))}));return rows;},{validate:body=>parseSource({success:true,data:{rawHtml:JSON.stringify(body),metadata:{statusCode:200}}}),recover:async url=>{metrics.catalogueDirectRepairs=(metrics.catalogueDirectRepairs||0)+1;console.log(JSON.stringify({phase:'catalogue-exception-repair',url}));return JSON.parse(await scrapeRaw(url,{fresh:true}));},maxRepairs:Math.min(12,Math.floor(budget.limit/2))});
 async function raw(input,options={}){
  const url=sourceUrl(input),u=new URL(url),catalogue=u.pathname==='/api/productlist';
  const identifier=JSON.stringify({url,formats:options.formats||[]});if(active.has(identifier))return active.get(identifier);
  const promise=(async()=>{
   if(catalogue&&policy.catalogueTransport==='enhanced-batch'){const body=await catalogueBatch(url);return {success:true,data:{rawHtml:JSON.stringify(body),metadata:{statusCode:200,sourceURL:url,provider:'firecrawl-enhanced-catalogue-batch'}}};}
   if(catalogue){const page=await take();try{let body;metrics.catalogueRequests=(metrics.catalogueRequests||0)+1;
    try{if(page.url().startsWith('https://search-lon.therange.co.uk/')){
     let result;for(let retry=0;retry<2;retry++){result=await page.evaluate(async target=>{try{const r=await fetch(target,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(25000)});const text=await r.text();let value;try{value=JSON.parse(text)}catch{}return {status:r.status,value,retryAfter:r.headers.get('retry-after')}}catch(e){return {status:0,error:e.message}}},url);if(result.status===200&&result.value)break;if(retry===0)await new Promise(resolve=>setTimeout(resolve,Math.min(6000,Math.max(1500,Number(result.retryAfter||0)*1000))));}
     if(result.status!==200||!result.value)throw new SourceError('Catalogue JSON request failed HTTP '+result.status,result.status);body=result.value;
    }else body=await jsonPage(page,url);}catch(e){if([400,404].includes(e.status))throw e;console.error(JSON.stringify({phase:'catalogue-fallback',source:url,status:e.status,error:e.message}));body=JSON.parse(await scrapeRaw(url));}
    return {success:true,data:{rawHtml:JSON.stringify(body),metadata:{statusCode:200,sourceURL:url,provider:'firecrawl-browser'}}}}finally{release(page)}}
   const family=await familyFor(url),sku=u.hash.slice(1).replace(/^0+(?=\d)/,''),variant=family.variants.find(v=>String(v.sku).replace(/^0+(?=\d)/,'')===sku);
   if(!variant)throw Error('官网商品JSON没有请求的具体SKU：'+sku);
   const data={sourceVariant:variant,familyEvidence:family.evidence,metadata:{statusCode:200,sourceURL:url,provider:'firecrawl-browser'}};
   if(options.formats?.some(f=>f==='screenshot'||f?.type==='screenshot'))data.screenshotBase64=await capture(url,family).catch(()=>enhancedCapture(url));
   return {success:true,data};
  })();active.set(identifier,promise);try{return await promise}finally{active.delete(identifier)}
 }
 const reader=async url=>parseSource(await raw(url));reader.raw=raw;if(policy.catalogueTransport==='enhanced-batch'){reader.many=urls=>Promise.all(urls.map(reader));reader.fresh=url=>catalogueBatch.fresh(sourceUrl(url));}
 reader.batchDocuments=async(fn,payload)=>scriptAction('('+fn.toString()+')('+JSON.stringify(payload)+')');
 reader.previewAssets=async(urls,options={})=>scriptAction('('+readPreviewAssets.toString()+')('+JSON.stringify({urls,maxSide:options.maxSide||320})+')',{needsImages:true});
 reader.prepareNativeCapture=async()=>{if(policy.nativeCaptureEnabled!==false&&!sessionClosed)await start();};
 reader.captureVerified=(url,options={})=>{const id=JSON.stringify([sourceUrl(url),options.preferredThumbnail||null]);if(!verifiedCaptures.has(id))verifiedCaptures.set(id,(async()=>{if(session&&!sessionClosed)try{const u=new URL(sourceUrl(url));u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');const family=await families.get(u.href);return await capture(url,family,options);}catch(e){metrics.nativeCaptureFailures=(metrics.nativeCaptureFailures||0)+1;console.error(JSON.stringify({phase:'native-NEW-capture-fallback',sku:new URL(url).hash.slice(1),status:e.status||0,error:String(e.message).slice(0,160)}));
   if(/net::ERR_QUIC_PROTOCOL_ERROR/.test(String(e.message))){nativeTransportFailures.add(sourceUrl(url));if(nativeTransportFailures.size>=2){metrics.nativeCaptureDisabled='repeated-QUIC-transport-failure';await reader.closeBrowser();console.log(JSON.stringify({phase:'native-NEW-session-stopped',reason:metrics.nativeCaptureDisabled,failedPages:nativeTransportFailures.size}));}}
  }return enhancedCapture(url,options);})());return verifiedCaptures.get(id)};
 reader.repairFamily=(url,{preferredThumbnail}={})=>{const u=new URL(sourceUrl(url));u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');const key=u.href,error=familyFailures.get(key);if(!error||error.status===404)return Promise.reject(error||Error('No failed family to recover'));if(!priorityRepairs.has(key))priorityRepairs.set(key,(async()=>{await reader.captureVerified(url,{preferredThumbnail,recoverFamily:true});if(!families.has(key))throw error;return true})());return priorityRepairs.get(key)};
 reader.repairFamilies=async products=>{const unique=new Map();for(const p of products){const u=new URL(sourceUrl(p.sourceUrl));u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');if(familyFailures.has(u.href)&&familyFailures.get(u.href).status!==404&&!unique.has(u.href))unique.set(u.href,p);}const queue=[...unique.values()];let cursor=0,recovered=0;await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{while(cursor<queue.length){const p=queue[cursor++];try{await reader.repairFamily(p.sourceUrl,{preferredThumbnail:p.variantImageUrl});recovered++;console.log(JSON.stringify({phase:'NEW-family-visible-page-recovery',sku:p.sku,recovered,total:queue.length}))}catch(e){console.error(JSON.stringify({phase:'NEW-family-visible-page-pending',sku:p.sku,error:String(e.message).slice(0,200)}));}}}));return {attempted:queue.length,recovered};};
 reader.originalsFor=url=>captureOriginals.get(sourceUrl(url))||[];
 reader.familyCount=()=>families.size;
 reader.recommendedFamilyBatchSize=()=>policy.familyBatchSize||100;
 reader.familyReady=input=>{const u=new URL(sourceUrl(input));u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');return families.has(u.href)};
 reader.prepareFamilies=async products=>{
  const urls=[...new Set(products.map(p=>{const u=new URL(sourceUrl(p.sourceUrl));u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');return u.href}))].filter(url=>!families.has(url)&&!familyFailures.has(url));
  if(!urls.length)return;const batchSize=policy.familyBatchSize||100;for(let offset=0;offset<urls.length;offset+=batchSize){const batchUrls=urls.slice(offset,offset+batchSize);
  const makeScript=(batchUrls,concurrency=policy.familyBatchConcurrency||4)=>'(async()=>{const read='+readFamilyBundle.toString()+';const urls='+JSON.stringify(batchUrls)+';let cursor=0;const results=[],end=Date.now()+50000;await Promise.all(Array.from({length:'+String(concurrency)+'},async()=>{while(cursor<urls.length&&Date.now()<end){const url=urls[cursor++];try{results.push({url,bundle:await read({url,jsonUrl:url+"?json",timeoutMs:'+String(policy.familyFetchTimeoutMs||10000)+'})})}catch(e){results.push({url,error:e.message})}}}));while(cursor<urls.length)results.push({url:urls[cursor++],deferred:true,error:"bounded batch time limit"});return results})()';
  const started=Date.now();let results=await scriptAction(makeScript(batchUrls));
  const check=(rows,expected)=>{if(rows.length!==expected.length||new Set(rows.map(r=>r.url)).size!==expected.length||rows.some(r=>!expected.includes(r.url)))throw Error('商品系列批量补查地址不一致')};check(results,batchUrls);
  // A failed subrequest is retried once in a new, smaller action. Successful
  // families and permanent source responses are never repeated.
  const transient=results.filter(r=>r.deferred||r.bundle?.status===0||r.bundle?.status===429||r.bundle?.status>=500).map(r=>r.url);
  const repaired=new Map();for(let n=0;n<transient.length;n+=50){const retryUrls=transient.slice(n,n+50),retry=await scriptAction(makeScript(retryUrls,4));check(retry,retryUrls);for(const r of retry)repaired.set(r.url,r);}
  if(transient.length){results=results.map(r=>repaired.get(r.url)||r);console.log(JSON.stringify({phase:'family-bounded-continuation',retried:transient.length,recovered:[...repaired.values()].filter(r=>r.bundle?.status===200).length,attempts:1}));}

  const elapsed=Date.now()-started,good=results.filter(r=>r.bundle?.status===200&&r.bundle?.variants?.length&&r.bundle?.evidence?.productId).length,deferred=results.filter(r=>r.deferred).length;metrics.familyBatchTimings||=[];metrics.familyBatchTimings.push({count:batchUrls.length,elapsedMs:elapsed,good,deferred});
  if(policy.adaptiveFamilies){const processed=results.filter(r=>!r.deferred).length;if(deferred)policy.familyBatchSize=Math.max(100,Math.min(400,Math.ceil(processed*1.05)));else if(elapsed<65000)policy.familyBatchSize=Math.min(400,Math.max(100,batchUrls.length*2));}
  if(results.length!==batchUrls.length||results.some(r=>!batchUrls.includes(r.url)))throw Error('商品系列批量补查地址不一致');
  for(const r of results){const b=r.bundle;if(b?.status===200&&b.variants?.length&&b.evidence?.productId){b.evidence.observedAt=new Date(now()).toISOString();b.evidence.sourceTransport='enhanced-batch';families.set(r.url,Promise.resolve({variants:b.variants,evidence:b.evidence}));metrics.familyReads++;}else {const error=new SourceError('官网商品详情链接异常，未返回可核实的具体SKU规格；本轮目录价格、库存、NEW与图片独立更新',b?.status||0);error.deferred=Boolean(r.deferred);error.transient=r.deferred||b?.status===0||b?.status===429||b?.status>=500;error.sourceResponse={url:r.url,jsonStatus:b?.jsonStatus,htmlStatus:b?.htmlStatus,jsonError:b?.jsonError,htmlError:b?.htmlError,observedAt:new Date(now()).toISOString()};familyFailures.set(r.url,error);if(b?.jsonStatus===200&&b.jsonBody)partialFamilies.set(r.url,{jsonBody:b.jsonBody});console.error(JSON.stringify({phase:'family-batch-failure',url:r.url,status:b?.status,jsonStatus:b?.jsonStatus,htmlStatus:b?.htmlStatus,jsonError:b?.jsonError,htmlError:b?.htmlError,variants:b?.variants?.length,productId:b?.evidence?.productId,error:r.error}));}}}
 };
 reader.auditImages=async (products,previous={},options={})=>{
  const checkpoint=policy.imageCheckpoint?await fs.readFile(policy.imageCheckpoint,'utf8').then(JSON.parse).catch(()=>({})):{};
  const browserRecovery=await fs.readFile('web/browser-image-recovery.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {};throw e;});
  previous={...previous,entries:{...checkpoint.entries,...previous.entries,...browserRecovery.entries}};
  const allUrls=[...new Set(products.map(p=>p.variantImageUrl||p.imageUrl).filter(Boolean))],results=[],known=[],newUrls=[],validPrior={};
  for(const url of allUrls){
   let u;try{u=new URL(url)}catch{}if(!u||u.protocol!=='https:'||!['www.therange.co.uk','kube-media-unpublished.rstore.com'].includes(u.hostname)||!u.pathname.startsWith('/media/')){results.push({url,ok:false,error:/placeholder/i.test(url)?'source-placeholder-no-product-photo':'source-image-URL-not-verified'});continue;}
   const old=previous.entries?.[url];let valid=false;if(old?.ok&&old.width>=64&&old.height>=64&&/^images\/source\/[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(old.cachedImageUrl||'')){try{valid=createHash('sha256').update(await fs.readFile('web/'+old.cachedImageUrl)).digest('hex')===old.hash;}catch{}}
   if(valid){validPrior[url]={retrievedFrom:old.retrievedFrom,hash:old.hash,cachedImageUrl:old.cachedImageUrl,etag:old.etag,lastModified:old.lastModified,width:old.width,height:old.height,bytes:old.bytes,mime:old.mime};if(policy.repairImagesOnly||policy.imageRefreshAfter&&Date.parse(old.observedAt)>=Date.parse(policy.imageRefreshAfter))results.push({...old,observedAt:old.observedAt||previous.observedAt,retained:true});else known.push(url);}else newUrls.push(url);
  }
  const tasks=[];const hashBatch=policy.imageHashBatchSize||400;for(let offset=0;offset<known.length;offset+=hashBatch)tasks.push({urls:known.slice(offset,offset+hashBatch),hashOnly:true});
  for(let offset=0;offset<newUrls.length;){const size=policy.imageBatchProbe&&offset===0?3:Math.min(500,options.bodyBatchSize||policy.imageBodyBatchSize||200);tasks.push({urls:newUrls.slice(offset,offset+size),hashOnly:false});offset+=size;}
  await fs.mkdir('web/images/source',{recursive:true});let rechecked=0,changed=0;const retryUrls=new Set(),retried=new Set();
  for(let taskIndex=0;taskIndex<tasks.length;taskIndex++){
   guard();const task=tasks[taskIndex],items=task.urls.map(url=>({url,prior:validPrior[url],hashOnly:task.hashOnly}));metrics.imageBatchRequests=(metrics.imageBatchRequests||0)+1;
   let batch;try{batch=await scriptAction('('+readImageBatch.toString()+')('+JSON.stringify(items)+')',{needsImages:true});}catch(error){
    if([408,500,502,503,504].includes(error.status)&&(task.attempt||0)<2){const size=Math.max(1,Math.ceil(task.urls.length/2));for(let n=0;n<task.urls.length;n+=size)tasks.push({...task,urls:task.urls.slice(n,n+size),attempt:(task.attempt||0)+1});console.log(JSON.stringify({phase:'image-transport-bounded-retry',status:error.status,urls:task.urls.length,attempt:(task.attempt||0)+1}));continue;}throw error;
   }
   if(batch.length!==items.length||batch.some(r=>!items.some(i=>i.url===r.url)))throw Error('图片批量核验没有返回全部请求地址');
   if(taskIndex===0&&batch.filter(r=>!r.deferred&&(!r.ok||r.width<64||r.height<64)).length>batch.filter(r=>!r.deferred).length*.8){console.error(JSON.stringify({phase:'image-batch-failure',count:batch.length,failures:batch.filter(r=>!r.ok||r.width<64||r.height<64).slice(0,3).map(({url,status,error,debug})=>({url,status,error,debug}))}));throw Error('图片主通道未通过，停止后续付费批次');}
   rechecked+=batch.filter(r=>!r.deferred).length;const needsBody=[],deferred=[];
   for(const item of batch){
    if(item.deferred){deferred.push(item.url);continue;}if(!item.ok&&!retried.has(item.url)&&(item.status===0||item.status===429||item.status>=500||!item.debug&&/fetch-or-decode/.test(item.error||''))){retried.add(item.url);retryUrls.add(item.url);continue;}
    item.observedAt=new Date(now()).toISOString();if(item.width<64||item.height<64){item.ok=false;item.error='placeholder-too-small'}
    if(item.ok&&item.needsBody){needsBody.push(item.url);changed++;continue;}
    if(item.ok)try{
     if(item.dataBase64){const bytes=Buffer.from(item.dataBase64,'base64');if(createHash('sha256').update(bytes).digest('hex')!==item.hash)throw Error('image hash mismatch');const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'})[item.mime];if(!ext)throw Error('unsupported image type');item.cachedImageUrl='images/source/'+item.hash+'.'+ext;await fs.writeFile('web/'+item.cachedImageUrl,bytes);delete item.dataBase64;}
     if(!item.cachedImageUrl||!/^images\/source\/[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(item.cachedImageUrl))throw Error('image cache missing');
     const stored=await fs.readFile('web/'+item.cachedImageUrl);if(createHash('sha256').update(stored).digest('hex')!==item.hash)throw Error('cached image hash mismatch');
    }catch(e){delete item.dataBase64;item.ok=false;item.error=e.message;}
    results.push(item);
   }
   for(let offset=0;offset<deferred.length;offset+=150)tasks.push({urls:deferred.slice(offset,offset+150),hashOnly:task.hashOnly});
   if(taskIndex===tasks.length-1&&retryUrls.size){const retries=[...retryUrls];retryUrls.clear();for(let offset=0;offset<retries.length;offset+=200)tasks.push({urls:retries.slice(offset,offset+200),hashOnly:false});}
   for(let offset=0;offset<needsBody.length;offset+=200)tasks.push({urls:needsBody.slice(offset,offset+200),hashOnly:false});
   if(policy.imageCheckpoint)await atomicJson(policy.imageCheckpoint,{entries:{...checkpoint.entries,...previous.entries,...Object.fromEntries(results.filter(r=>r.ok).map(r=>[r.url,r]))},failures:results.filter(r=>!r.ok),observedAt:new Date(now()).toISOString()});
   console.log(JSON.stringify({phase:'image-verification',checked:results.length,total:allUrls.length,changed}));
  }
  const byUrl=new Map(results.map(r=>[r.url,r]));for(const p of products){const r=byUrl.get(p.variantImageUrl||p.imageUrl);if(r?.ok){p.cachedImageUrl=r.cachedImageUrl;p.imageCacheEvidence={sourceUrl:r.url,sha256:r.hash,observedAt:r.observedAt};}}
  metrics.sourceImageChecks+=rechecked;const loaded=results.filter(r=>r.ok).length;
  return {mode:'live-enhanced-batches-and-original-image-cache',checked:results.length,rechecked,retained:results.filter(r=>r.ok&&r.retained).length,changed,loaded,failed:results.length-loaded,failures:results.filter(r=>!r.ok),entries:Object.fromEntries(results.filter(r=>r.ok).map(r=>[r.url,r])),observedAt:new Date(now()).toISOString(),perImageScrapeRequests:0,batchScrapeRequests:metrics.imageBatchRequests||0};
 };
 reader.metrics=()=>({...metrics,scrapeCredits,sessionSeconds:created?Math.ceil(((browserEndedAt||now())-created)/1000):0});
 reader.closeBrowser=async()=>{
  if(sessionClosed)return;sessionClosed=true;
  if(!session){browserReceipt={creditsBilled:0};metrics.fallbackLimit=availableFallback();return;}
  try{if(session.id)browserReceipt=await api('interact/'+encodeURIComponent(session.id),'DELETE');}
  catch{metrics.closeReceiptUnavailable=true;}
  finally{await browser?.close().catch(()=>{});browserEndedAt=now();deadline=0;metrics.fallbackLimit=availableFallback();}
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
