import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DOMParser} from 'linkedom';
const exec=promisify(execFile),ORIGINS=new Set(['https://www.therange.co.uk','https://search-lon.therange.co.uk']);
export class ProductDOMParser extends DOMParser{parseFromString(text,type){return super.parseFromString(type==='text/html'&&!/<(?:html|body)\b/i.test(text)?'<html><body>'+text+'</body></html>':text,type);}}
const target=raw=>{const u=new URL(raw);if(!ORIGINS.has(u.origin)||u.username||u.password||u.port)throw Error('Unsupported free source origin');return u;};
export async function ordinaryHttp2(url,{timeoutMs=12000}={}){
 target(url);try{const{stdout}=await exec('curl',['--disable','--http2','--location','--max-time',String(Math.ceil(timeoutMs/1000)),'--silent','--show-error','--write-out','\n%{http_code}\n%{url_effective}',url],{timeout:timeoutMs+1000,maxBuffer:25000000});const end=stdout.lastIndexOf('\n'),before=stdout.lastIndexOf('\n',end-1);return{status:Number(stdout.slice(before+1,end)),url:stdout.slice(end+1),text:stdout.slice(0,before)};}catch(e){return{status:0,error:String(e.message).slice(0,140)};}
}
export function createFreeFirstRangeSource({fetcher=fetch,http2=ordinaryHttp2,browserRead,timeoutMs=12000}={}){
 const unavailable=new Map(),metrics={freeHttpRequests:0,freeHttp2Requests:0,freeBrowserRequests:0,freeCataloguePages:0,freeFamilies:0,freeSourceAttempts:[]};let browser,context,opening;
 const ordinary=browserRead||(async(url)=>{
  try{
   if(!opening)opening=(async()=>{const{chromium}=await import('playwright');browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext();})();
   await opening;const page=await context.newPage();
   try{const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:timeoutMs}),u=new URL(url),json=u.searchParams.has('json')||u.pathname==='/api/productlist';return{status:r?.status()||0,url:page.url(),text:json?await page.locator('body').innerText():await page.content()};}
   finally{await page.close();}
  }catch(e){return{status:0,error:String(e.message).slice(0,140)};}
 });
 const transports=[['http',async url=>{try{const r=await fetcher(url,{cache:'no-store',redirect:'manual',headers:{accept:'application/json,text/html;q=0.9'},signal:AbortSignal.timeout(timeoutMs)});return{status:r.status,url:r.url||url,text:await r.text()};}catch(e){return{status:0,error:String(e.message).slice(0,140)};}}],['http2',http2],['browser',ordinary]];
 async function read(url,{json=false,validate=()=>true}={}){
  const origin=target(url).origin,attempts=[];
  for(const [method,run]of transports){if(unavailable.get(origin)?.has(method)){attempts.push({method,cachedUnavailable:true});continue;}
   metrics[method==='http'?'freeHttpRequests':method==='http2'?'freeHttp2Requests':'freeBrowserRequests']++;
   let r;try{r=await run(url,{timeoutMs});if(r.url&&target(r.url).origin!==origin)throw Error('Free source redirected to a different origin');}catch(e){r={status:0,error:String(e.message).slice(0,140)};}
   const a={method,status:r.status||0,...(r.error?{error:r.error}:{}),url};attempts.push(a);metrics.freeSourceAttempts.push(a);metrics.freeSourceAttempts=metrics.freeSourceAttempts.slice(-100);
   if(r.status===200)try{const value=json?JSON.parse(r.text):r.text;if(validate(value))return{status:200,value,method,attempts};}catch{}
   if([0,401,403,408,429,500,502,503,504].includes(r.status||0)){if(!unavailable.has(origin))unavailable.set(origin,new Set());unavailable.get(origin).add(method);}
  }
  return{status:attempts.filter(a=>!a.cachedUnavailable).length===3&&attempts.every(a=>a.status===404)?404:0,attempts};
 }
 async function catalogues(urls){const rows=[];let cursor=0;while(cursor<urls.length){const url=urls[cursor++],r=await read(url,{json:true,validate:d=>Array.isArray(d?.products)&&Number.isInteger(d.totalResults)});if(r.status===200){metrics.freeCataloguePages++;rows.push({url,status:200,body:r.value,observedAt:new Date().toISOString(),source:'ordinary-free-'+r.method});}else if(r.status===404)rows.push({url,status:404,error:'Official API returned 404 through all ordinary free transports'});if(unavailable.get(target(url).origin)?.size===3)break;}return rows;}
 async function families(products,parseFamily){
  const groups=new Map();for(const p of products){const u=target(p.sourceUrl);u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');if(!groups.has(u.href))groups.set(u.href,[]);groups.get(u.href).push({sku:String(p.sku||new URL(p.sourceUrl).hash.slice(1)),variantId:p.variantId||null});}
  const rows=[],parse=new Function('DOMParser','payload','return ('+parseFamily.toString()+')(payload)');
  for(const[url,anchors]of groups){const j=await read(url+'?json',{json:true,validate:d=>Array.isArray(d?.variant_arr)&&d.variant_arr.some(v=>anchors.some(a=>String(v.sku)===a.sku&&String(v.code).replace(/^0+(?=\d)/,'')===a.sku&&(!a.variantId||String(v.id)===String(a.variantId))))});
   if(j.status===404){rows.push({url,bundle:{status:404,jsonStatus:404,htmlStatus:404},free:true});continue;}
   if(j.status!==200){if(unavailable.get(target(url).origin)?.size===3)break;continue;}
   const h=await read(url,{validate:t=>typeof t==='string'&&/product_id|gtm_product_data/.test(t)});if(h.status!==200)continue;
   const b=await parse(ProductDOMParser,{url,jsonUrl:url+'?json',initial:j.value,providedHtml:h.value,anchors});
   if(b.status===200&&b.evidence?.productId&&b.variants?.length&&b.variants.every(v=>String(v.prod_id)===String(b.evidence.productId))){b.evidence.sourceTransport='ordinary-free-'+j.method+'-and-'+h.method;b.evidence.observedAt=new Date().toISOString();rows.push({url,bundle:b,free:true});metrics.freeFamilies++;}
  }return rows;
 }
 return{catalogues,families,metrics:()=>structuredClone(metrics),close:async()=>{await browser?.close();}};
}
