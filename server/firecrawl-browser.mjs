import {SourceError,parseSource} from './sync.mjs';
import {sourceUrl} from './free-source.mjs';
import {budgetError} from './credit-budget.mjs';

export async function createFirecrawlBrowserReader({policy,budget,fetcher=fetch,connect,now=()=>Date.now()}={}){
 const key=process.env.FIRECRAWL_API_KEY;if(!key)throw new SourceError('Firecrawl服务器密钥尚未配置',401);
 let session,browser,context,starting,closed=false,created=0,deadline=0,allocatedPages=0;
 const pages=[],waiting=[],families=new Map(),active=new Map();
 const parallel=policy.browserConcurrency||4,ttl=Math.min(1800,policy.maxSessionSeconds||1800,Math.floor(budget.limit*30));
 if(ttl<60)throw budgetError('本轮积分不足以创建一个浏览器会话');
 const metrics={provider:'firecrawl-browser',billingMode:'code-session-time',firecrawlRequests:0,scrapeRequests:0,firecrawlCredits:0,creditsEstimatedUpperBound:ttl/30,browserPages:0,familyReads:0,familyReuse:0,screenshots:0,sourceImageChecks:0};
 async function api(path,method,body){
  metrics.firecrawlRequests++;
  const response=await fetcher('https://api.firecrawl.dev/v2/'+path,{method,headers:{authorization:'Bearer '+key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
  const result=await response.json();if(!response.ok||result.success===false)throw new SourceError('Firecrawl '+method+' 请求未成功 HTTP '+response.status,response.status);
  return result;
 }
 function guard(){if(closed||deadline&&now()+30000>=deadline)throw budgetError('本轮浏览器运行时间已达到积分硬上限，已停止新增请求');}
 async function start(){
  if(!starting)starting=(async()=>{
   guard();created=now();deadline=created+ttl*1000;
   session=await api('interact','POST',{ttl,activityTtl:120,streamWebView:false,blockAds:true});
   if(!session.id||!session.cdpUrl)throw Error('Firecrawl没有返回浏览器会话');
   try{browser=await(connect||(async url=>(await import('playwright')).chromium.connectOverCDP(url)))(session.cdpUrl);}
   catch{throw Error('Firecrawl浏览器连接失败；会话将立即关闭');}
   context=browser.contexts()[0]||await browser.newContext({viewport:{width:1440,height:1000},locale:'en-GB'});
  })();
  await starting;
 }
 async function take(){await start();guard();if(pages.length)return pages.pop();if(allocatedPages<parallel){allocatedPages++;return context.newPage()}return new Promise((resolve,reject)=>waiting.push({resolve,reject}))}
 function release(page){const waiter=waiting.shift();if(waiter)waiter.resolve(page);else pages.push(page)}
 async function navigate(page,url){guard();metrics.browserPages++;const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});if(!response||response.status()>=400)throw new SourceError('官网请求失败 HTTP '+(response?.status()||0)+' '+new URL(url).pathname,response?.status()||0);return response;}
 async function jsonPage(page,url){await navigate(page,url);let text;try{text=await page.locator('body').innerText();return JSON.parse(text)}catch{throw new SourceError('官网未返回可验证的JSON：'+await page.title(),/Just a moment|security verification/i.test(text||'')?403:0)}}
 async function familyFor(input){
  const u=new URL(input);u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'')+'/';const canonical=u.href;
  if(families.has(canonical)){metrics.familyReuse++;return families.get(canonical)}
  const promise=(async()=>{
   const page=await take();try{
    const jsonUrl=canonical+'?json';
    let initial;
    if(!page.url().startsWith('https://www.therange.co.uk/'))initial=await jsonPage(page,jsonUrl);
    const bundle=await page.evaluate(async ({url,jsonUrl,initial})=>{
     const read=async(target,json)=>{const response=await fetch(target,{credentials:'include',signal:AbortSignal.timeout(20000)});if(response.status!==200)return {status:response.status};return {status:200,value:json?await response.json():await response.text()}};
     const [data,html]=await Promise.all([initial?{status:200,value:initial}:read(jsonUrl,true),read(url,false)]);
     if(data.status!==200||html.status!==200)return {status:data.status!==200?data.status:html.status};
     const body=data.value,doc=new DOMParser().parseFromString(html.value,'text/html'),plain=html=>new DOMParser().parseFromString(String(html||''),'text/html').body.textContent.replace(/\s+/g,' ').trim();
     const description=doc.querySelector('#product-description')?.cloneNode(true);description?.querySelectorAll('a,script,style,#product-dyn-variant-desc').forEach(e=>e.remove());
     let product;for(const el of doc.querySelectorAll('script[type="application/ld+json"]')){try{const d=JSON.parse(el.textContent);if(d['@type']==='Product')product=d}catch{}}
     const offers=product?.offers?.offers||[product?.offers];
     const evidence={url,jsonUrl,productId:doc.querySelector('#product_id')?.value||null,title:doc.title,features:Array.from(doc.querySelectorAll('#product-dyn-features-ul li')).map(e=>plain(e.textContent)),information:description?plain(description.textContent):'',offers:offers.filter(Boolean).map(o=>({sku:String(o.sku),image:o.image?.url||null})),gallery:Array.from(doc.querySelectorAll('img[data-variant]')).map(e=>({url:e.getAttribute('src'),variants:(e.getAttribute('data-variant')||'').split(',').filter(Boolean)}))};
     const variants=Array.isArray(body.variant_arr)?body.variant_arr.map(v=>({code:v.code,prod_id:v.prod_id,sku:v.sku,id:v.id,attributes:v.attributes,attributes_supplementary:{'Model Number':v.attributes_supplementary?.['Model Number']},product_specification:v.product_specification||[],features:v.features||[],desc_override:v.desc_override,descriptionText:plain(v.description_html)})):[];
     return {status:200,variants,evidence};
    },{url:canonical,jsonUrl,initial});
    if(bundle.status!==200)throw new SourceError('官网商品数据请求失败 HTTP '+bundle.status,bundle.status);
    const {variants,evidence}=bundle;
    if(!variants.length||!evidence.productId||!evidence.offers.length)throw Error('商品系列身份核验未通过：'+evidence.title);
    metrics.familyReads++;return {variants,evidence};
   }finally{release(page)}
  })();families.set(canonical,promise);return promise;
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
   if(image)await page.waitForFunction(url=>Array.from(document.images).some(i=>i.complete&&i.naturalWidth>0&&(i.currentSrc===url||i.src===url)),image,{timeout:12000});
   const section=page.locator('#variant_container');await section.scrollIntoViewIfNeeded();const bytes=await section.screenshot({type:'png',timeout:20000});metrics.screenshots++;return bytes.toString('base64');
  }finally{release(page)}
 }
 async function raw(input,options={}){
  const url=sourceUrl(input),u=new URL(url),catalogue=u.pathname==='/api/productlist';
  const identifier=JSON.stringify({url,formats:options.formats||[]});if(active.has(identifier))return active.get(identifier);
  const promise=(async()=>{
   if(catalogue){const page=await take();try{const body=await jsonPage(page,url);return {success:true,data:{rawHtml:JSON.stringify(body),metadata:{statusCode:200,sourceURL:url,provider:'firecrawl-browser'}}}}finally{release(page)}}
   const family=await familyFor(url),sku=u.hash.slice(1).replace(/^0+(?=\d)/,''),variant=family.variants.find(v=>String(v.sku).replace(/^0+(?=\d)/,'')===sku);
   if(!variant)throw Error('官网商品JSON没有请求的具体SKU：'+sku);
   const data={sourceVariant:variant,familyEvidence:family.evidence,metadata:{statusCode:200,sourceURL:url,provider:'firecrawl-browser'}};
   if(options.formats?.some(f=>f==='screenshot'||f?.type==='screenshot'))data.screenshotBase64=await capture(url,family);
   return {success:true,data};
  })();active.set(identifier,promise);try{return await promise}finally{active.delete(identifier)}
 }
 const reader=async url=>parseSource(await raw(url));reader.raw=raw;
 reader.auditImages=async products=>{
  const urls=[...new Set(products.map(p=>p.variantImageUrl||p.imageUrl).filter(Boolean))];
  for(const url of urls){const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.therange.co.uk'||!u.pathname.startsWith('/media/'))throw Error('商品图片来源未通过核验');}
  const page=await take(),results=[];try{
   await navigate(page,'https://www.therange.co.uk/p/deluxe-pre-lit-pop-up-tree-6ft/p12776/#12776');
   for(let offset=0;offset<urls.length;offset+=60){guard();const batch=await page.evaluate(async urls=>{
    let cursor=0;const results=[];await Promise.all(Array.from({length:8},async()=>{while(cursor<urls.length){const url=urls[cursor++];results.push(await new Promise(resolve=>{const image=new Image(),timer=setTimeout(()=>{image.src='';resolve({url,ok:false,error:'timeout'})},8000);image.onload=()=>{clearTimeout(timer);resolve({url,ok:image.naturalWidth>0,width:image.naturalWidth,height:image.naturalHeight})};image.onerror=()=>{clearTimeout(timer);resolve({url,ok:false,error:'load-failed'})};image.src=url}))}}));return results;
   },urls.slice(offset,offset+60));results.push(...batch);console.log(JSON.stringify({phase:'image-verification',checked:results.length,total:urls.length}));}
  }finally{release(page)}
  metrics.sourceImageChecks+=results.length;const loaded=results.filter(r=>r.ok).length;
  return {mode:'source-address-and-browser-decode',checked:results.length,loaded,failed:results.length-loaded,failures:results.filter(r=>!r.ok),observedAt:new Date(now()).toISOString(),perImageScrapeRequests:0};
 };
 reader.metrics=()=>({...metrics,sessionSeconds:created?Math.ceil((now()-created)/1000):0});
 reader.close=async()=>{
  if(closed)return;closed=true;for(const waiter of waiting.splice(0))waiter.reject(budgetError('浏览器会话已关闭'));
  let receipt;
  try{if(session?.id)receipt=await api('interact/'+encodeURIComponent(session.id),'DELETE');}
  catch{metrics.closeReceiptUnavailable=true;}
  finally{await browser?.close().catch(()=>{});}
  if(session){metrics.firecrawlCredits=Number.isFinite(receipt?.creditsBilled)?receipt.creditsBilled:ttl/30;metrics.billingVerified=Number.isFinite(receipt?.creditsBilled);metrics.sessionDurationMs=receipt?.sessionDurationMs;metrics.receipt={sessionId:session.id,creditsBilled:metrics.firecrawlCredits,billingVerified:metrics.billingVerified};}
  metrics.closed=true;
 };
 return reader;
}
