import fs from'node:fs/promises';
import{execFile}from'node:child_process';import{promisify}from'node:util';const run=promisify(execFile);
export const BQ_DIRECTORIES=[['tree','/departments/christmas/christmas-trees/DIY908923.cat'],['baubles','/christmas/christmas-decorations/christmas-tree-decorations/christmas-baubles.cat'],['tree-decorations','/christmas/christmas-decorations/christmas-tree-decorations.cat'],['wreath','/departments/christmas/christmas-decorations/christmas-wreaths-and-garlands/christmas-wreaths/DIY1588868.cat'],['garland','/departments/christmas/christmas-decorations/christmas-wreaths-and-garlands/christmas-garlands/DIY1588871.cat'],['skirt','/departments/christmas/christmas-decorations/christmas-baubles-tree-decorations/christmas-tree-skirts/DIY1588866.cat'],['standing','/christmas/christmas-decorations/christmas-standing-decorations.cat'],['inflatables','/departments/christmas/christmas-fun/christmas-inflatables/DIY1588851.cat'],['hanging','/christmas/christmas-decorations/christmas-tree-decorations/christmas-hanging-decorations.cat'],['topper','/departments/christmas/christmas-decorations/christmas-baubles-tree-decorations/christmas-tree-toppers/DIY921904.cat']];
export async function requestBqPage(url,{attempts=4,fresh=false,cookieFile=null,writeCookieJar=null,runner=run,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const u=new URL(url);if(u.origin!=='https://www.diy.com')throw Error('Unexpected B&Q page origin');
 if(!Number.isInteger(attempts)||attempts<1||attempts>4)throw Error('B&Q page retry bound must be 1 to 4');
 const transientStatus=new Set([408,429,500,502,503,504]),transientCurl=new Set([6,7,18,28,52,56,92]),delays=[2000,8000,20000];
 for(let n=0;n<attempts;n++){
  try{
   const{stdout}=await runner('curl',['--http2','--location','--max-time','45','--silent','--show-error','--write-out','\n%{http_code}',...(fresh?['--header','Cache-Control: no-cache']:[]),...(cookieFile?['--cookie',cookieFile]:[]),...(writeCookieJar?['--cookie-jar',writeCookieJar]:[]),u.href],{maxBuffer:18000000});
   const boundary=stdout.lastIndexOf('\n'),status=Number(stdout.slice(boundary+1)),html=stdout.slice(0,boundary);
   if(status===200)return{html,status,observedAt:new Date().toISOString(),attempts:n+1};
   throw Object.assign(Error('B&Q official page HTTP '+status),{status});
  }catch(e){
   e.sourceUrl=u.href;e.attempts=n+1;
   if(n===attempts-1||!(e.status?transientStatus.has(e.status):transientCurl.has(Number(e.code))))throw e;
  }
  await sleep(delays[n]);
 }
}
export function bqRouteField(html,routeName,field){const match=html.match(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/);if(!match)throw Error('B&Q route source data missing');const a=JSON.parse(JSON.parse(match[1])),memo=new Map();const decode=i=>{if(i<0)return undefined;if(memo.has(i))return memo.get(i);const v=a[i];if(v&&typeof v==='object'){const o=Array.isArray(v)?[]:{};memo.set(i,o);if(Array.isArray(v)){for(const x of v)o.push(decode(x));}else for(const[k,n]of Object.entries(v))o[decode(Number(k.slice(1)))]=decode(n);return o;}return v;};const root=a[0],loaderIndex=root[Object.keys(root).find(k=>a[Number(k.slice(1))]==='loaderData')],loaders=a[loaderIndex],routeIndex=loaders[Object.keys(loaders).find(k=>a[Number(k.slice(1))]===routeName)];if(routeIndex===undefined)throw Error('Official B&Q business route missing');const route=a[routeIndex],lister=decode(route[Object.keys(route).find(k=>a[Number(k.slice(1))]===field)]);return lister;}

export const bqRoute=html=>bqRouteField(html,'routes/plp','lister');
export function bqPdpProduct(html,expected){const p=bqRouteField(html,'routes/pdp','product');if(String(p?.id)!==String(expected)||String(p?.attributes?.ean)!==String(expected))throw Error('B&Q returned another exact EAN');const a=p.attributes;return{...p,attributes:Object.fromEntries(Object.entries(a).filter(([k])=>!['averageRating','reviews','review'].includes(k)))};}

// This is the same published React Router serverLoader response the site's
// browser requests on pagination. Read the typed business object, never execute
// scripts, and keep the human product URL separate from the data transport URL.
export function bqDataRouteField(text,routeName,field){const a=JSON.parse(String(text).split('\n')[0]);if(!Array.isArray(a))throw Error('B&Q native loader stream absent');const memo=new Map();const decode=i=>{if(i<0)return undefined;if(memo.has(i))return memo.get(i);const v=a[i];if(v&&typeof v==='object'){const out=Array.isArray(v)?[]:{};memo.set(i,out);if(Array.isArray(v))for(const x of v)out.push(decode(x));else for(const[k,n]of Object.entries(v))out[decode(Number(k.slice(1)))]=decode(n);return out;}return v;};const data=decode(0)?.[routeName]?.data?.[field];if(!data)throw Error('Official B&Q loader business field missing');return data;}
export async function requestBqDirectory(url,{fresh=false,session=null}={}){const u=new URL(url);if(u.origin!=='https://www.diy.com'||!u.pathname.endsWith('.cat'))throw Error('Official B&Q category URL required');const api=new URL(u);api.pathname+='.data';api.searchParams.set('_routes','routes/plp');const response=await requestBqPage(api.href,{fresh,cookieFile:session?.cookieFile});return{...response,sourceUrl:u.href,sourceApiUrl:api.href,lister:bqDataRouteField(response.html,'routes/plp','lister')};}

// Vary: Cookie is part of the official response contract. Keep one clean,
// anonymous visit across pagination; never load the user's browser/login state.
// The jar stays outside source caches/artifacts and is deleted after this run.
export async function createBqPublicSession(url,{requestPage=requestBqPage}={}){const u=new URL(url);if(u.origin!=='https://www.diy.com'||!u.pathname.endsWith('.cat'))throw Error('Official B&Q category required for anonymous session');await fs.mkdir('runtime/bq-public-session',{recursive:true,mode:0o700});const dir=await fs.mkdtemp('runtime/bq-public-session/run-'),cookieFile=dir+'/cookies.txt';try{u.pathname+='.data';u.searchParams.set('_routes','routes/plp');await requestPage(u.href,{fresh:true,writeCookieJar:cookieFile});await fs.chmod(cookieFile,0o600);return{cookieFile,close:()=>fs.rm(dir,{recursive:true,force:true})};}catch(e){await fs.rm(dir,{recursive:true,force:true});throw e;}}
