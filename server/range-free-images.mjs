import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import sharp from 'sharp';
const exec=promisify(execFile);
const allowed=url=>{const u=new URL(url);if(u.username||u.password||u.port||!['https://www.therange.co.uk','https://kube-media-unpublished.rstore.com'].includes(u.origin)||!/^\/media\/.+\.(?:jpe?g|png|webp|avif|gif)$/i.test(u.pathname))throw Error('An observed official source image is required');return u.origin;};
export async function ordinaryBinaryHttp2(url){
 allowed(url);try{const{stdout}=await exec('curl',['--disable','--http2','--location','--max-time','12','--silent','--show-error','--write-out','\n%{http_code}',url],{encoding:'buffer',timeout:13000,maxBuffer:25000000});const cut=stdout.lastIndexOf(10);return{status:Number(stdout.subarray(cut+1).toString('ascii')),bytes:stdout.subarray(0,cut)};}catch(e){return{status:0,error:String(e.message).slice(0,150)};}
}
export function createFreeFirstRangeImages({fetcher=fetch,http2=ordinaryBinaryHttp2,browserRead,save=async(file,bytes)=>{await fs.mkdir('web/images/source',{recursive:true});await fs.writeFile('web/'+file,bytes);}}={}){
 const denied=new Set(),unavailable=new Map(),failures=new Map(),attempts=[];let browser,context;
 const failed=(key,url,error)=>{const seen=failures.get(key)||new Set;seen.add(url);failures.set(key,seen);if(seen.size>=3)unavailable.set(key,error||'Repeated ordinary transport failure on three distinct source images');};
 const ordinary=browserRead||async function(url){try{if(!browser){const{chromium}=await import('playwright');browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext();}const p=await context.newPage();try{const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:15000});return{status:r?.status()||0,bytes:r?.ok()?await r.body():null};}finally{await p.close();}}catch(e){return{status:0,error:String(e.message).slice(0,150)};}};
 const methods=[['http',async url=>{try{const r=await fetcher(url,{signal:AbortSignal.timeout(12000)});return{status:r.status,bytes:r.ok?Buffer.from(await r.arrayBuffer()):null};}catch(e){return{status:0,error:String(e.message).slice(0,150)};}}],['http2',http2],['browser',ordinary]];
 return{attempts,async read(url){const origin=allowed(url),own=[];
  for(const[method,run]of methods){const denialKey=origin+' '+method;if(denied.has(denialKey)){own.push({method,cachedOriginDenial:true,status:403});continue;}if(unavailable.has(denialKey)){own.push({method,cachedOriginTransportFailure:true,status:0,error:unavailable.get(denialKey)});continue;}
   let r;try{r=await run(url);}catch(e){r={status:0,error:e.message};}const a={url,method,status:r.status,error:r.error};attempts.push(a);own.push(a);
   if(r.status===403||r.status===401)denied.add(denialKey);
   if(!r.status||r.status===408||r.status===429||r.status>=500)failed(denialKey,url,r.error);
   if(/executable doesn.t exist|browser.{0,35}(?:not installed|not found)|spawn .{0,80}ENOENT|operation not permitted/i.test(r.error||''))unavailable.set(denialKey,r.error);
   if(r.status===200&&r.bytes)try{const bytes=Buffer.from(r.bytes),m=await sharp(bytes).metadata();if(bytes.length>25000000||m.width<64||m.height<64)throw Error('Invalid source image dimensions');const hash=createHash('sha256').update(bytes).digest('hex'),ext=m.format==='jpeg'?'jpg':m.format;if(!['jpg','png','webp','avif','gif'].includes(ext))throw Error('Unsupported original source format');const cachedImageUrl='images/source/'+hash+'.'+ext;await save(cachedImageUrl,bytes);failures.delete(denialKey);return{ok:true,url,hash,cachedImageUrl,width:m.width,height:m.height,bytes:bytes.length,mime:'image/'+m.format,sourceBytesUnchanged:true,observedAt:new Date().toISOString(),method:'ordinary-free-'+method};}catch(e){a.error=String(e.message).slice(0,150);failed(denialKey,url,a.error);}
  }
  return{ok:false,url,attempts:own,freeMethodsExhausted:own.length===3,sourceMissing:own.length===3&&own.every(a=>a.status===404)};
 },async close(){await browser?.close();}};
}
