import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseSource,SourceError} from './sync.mjs';
import {sourceUrl,browserMarkdown} from './free-source.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function decodeHtml(s){return s.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[v.toLowerCase()]));}
export const htmlText=s=>decodeHtml(String(s).replace(/<\/(?:p|div|li)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'')).trim();
export const listText=s=>[...String(s).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>htmlText(m[1]).replace(/\s+/g,' '));
export function catalogueHtml(html){const pre=html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i)?.[1];if(!pre)throw Error('JSON document has no rendered data');const data=JSON.parse(decodeHtml(pre));if(!Array.isArray(data.products))throw Error('Not a source catalogue');return data;}
class Connection{
 constructor(socket){this.socket=socket;this.sequence=0;this.pending=new Map;this.handlers=new Set;socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}else for(const h of this.handlers)h(m)});socket.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Chrome connection closed'))}this.pending.clear()});}
 send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Chrome command timed out: '+method))},30000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))});}
 close(){this.socket.close()}
}
export async function createNativeChromeReader({concurrency=4,delayMs=750,maxPages=20000}={}){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('This isolated Chrome transport is restricted to the cloud runner');
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'range-native-chrome-'));
 const executable=process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':process.platform==='win32'?path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'):'/opt/google/chrome/chrome';
 const child=spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9222','--user-data-dir='+profile,'--no-first-run','--window-size=1440,1000','--lang=en-GB','about:blank'],{stdio:'ignore'});
 let launchError,connection;child.on('error',e=>{launchError=e});
 const metrics={provider:'native-chrome-dom',firecrawlRequests:0,firecrawlCredits:0,directRequests:0,browserPages:0,screenshots:0,deduplicated:0};
 const cleanup=async()=>{connection?.close();child.kill();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{})};
 try{
  let endpoint;
  for(let n=0;n<60&&!endpoint;n++){if(launchError)throw launchError;try{const r=await fetch('http://127.0.0.1:9222/json/version',{signal:AbortSignal.timeout(1000)});if(r.ok)endpoint=(await r.json()).webSocketDebuggerUrl}catch{}if(!endpoint)await pause(250)}
  if(!endpoint)throw Error('Isolated cloud Chrome did not start');
  const socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(Error('Chrome connection failed')),{once:true})});connection=new Connection(socket);
  const pages=[],waiters=[],inflight=new Map;let created=0;
  async function newPage(){const {targetId}=await connection.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await connection.send('Target.attachToTarget',{targetId,flatten:true});const page={targetId,sessionId,status:0};connection.handlers.add(m=>{if(m.sessionId===sessionId&&m.method==='Network.responseReceived'&&m.params.type==='Document')page.status=m.params.response.status});await connection.send('Page.enable',{},sessionId);await connection.send('Network.enable',{},sessionId);return page;}
  async function take(){if(pages.length)return pages.pop();if(created<concurrency){created++;return newPage()}return new Promise(r=>waiters.push(r))}
  function release(p){const next=waiters.shift();if(next)next(p);else pages.push(p)}
  async function document(p){const {root}=await connection.send('DOM.getDocument',{depth:0},p.sessionId);return {root:root.nodeId,html:(await connection.send('DOM.getOuterHTML',{nodeId:root.nodeId},p.sessionId)).outerHTML};}
  async function select(p,root,selector){const {nodeId}=await connection.send('DOM.querySelector',{nodeId:root,selector},p.sessionId);return nodeId?{nodeId,html:(await connection.send('DOM.getOuterHTML',{nodeId},p.sessionId)).outerHTML}:null;}
  async function rendered(p,url,isCatalogue){
   if(++metrics.browserPages>maxPages)throw new SourceError('Cloud collection page limit reached');
   p.status=0;const navigation=await connection.send('Page.navigate',{url},p.sessionId);if(navigation.errorText)throw Error(navigation.errorText);
   const expected=new URL(url).hash.slice(1).replace(/^0+(?=\d)/,''),until=Date.now()+45000;let last;
   while(Date.now()<until){
    try{last=await document(p);if(isCatalogue){const body=catalogueHtml(last.html);return {document:last,body}}const code=await select(p,last.root,'#product-dyn-code'),sku=code?htmlText(code.html).replace(/^[PM]/i,'').replace(/^0+(?=\d)/,''):'';const specs=await select(p,last.root,'#product-dyn-specification-ul');if(sku&&(!expected||sku===expected)&&specs&&listText(specs.html).length)return {document:last,specs:specs.html,sku};}catch{}
    await pause(500);
   }
   throw new SourceError(`官网浏览器没有返回${isCatalogue?'完整目录':'匹配SKU'}，HTTP ${p.status}；${htmlText(last?.html?.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'Unknown page')}`,p.status);
  }
  async function raw(input,options={}){
   const url=sourceUrl(input),isCatalogue=new URL(url).pathname==='/api/productlist',key=JSON.stringify([url,options.formats]);
   if(inflight.has(key)){metrics.deduplicated++;return inflight.get(key)}
   const request=(async()=>{const p=await take();try{const result=await rendered(p,url,isCatalogue);if(delayMs)await pause(delayMs);if(isCatalogue)return {success:true,data:{rawHtml:JSON.stringify(result.body),metadata:{statusCode:200,sourceURL:url,provider:'native-chrome-dom'}}};
    const features=await select(p,result.document.root,'#product-dyn-features-ul'),information=await select(p,result.document.root,'#product-description');
    const data={rawHtml:result.document.html,markdown:browserMarkdown({features:listText(features?.html||''),information:htmlText(information?.html||''),specs:listText(result.specs)}),metadata:{statusCode:200,sourceURL:url,provider:'native-chrome-dom',renderedProductSection:true}};
    if(options.formats?.some(f=>f==='screenshot'||f?.type==='screenshot')){const section=await select(p,result.document.root,'#variant_container');if(!section)throw Error('SKU product section missing');const {model}=await connection.send('DOM.getBoxModel',{nodeId:section.nodeId},p.sessionId);const xs=model.border.filter((_,i)=>i%2===0),ys=model.border.filter((_,i)=>i%2===1);const clip={x:Math.max(0,Math.min(...xs)),y:Math.max(0,Math.min(...ys)),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),scale:1};if(clip.width*clip.height>20000000)throw Error('Product screenshot exceeds size limit');data.screenshotBase64=(await connection.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true},p.sessionId)).data;metrics.screenshots++;}
    return {success:true,data};
   }finally{release(p)}})();inflight.set(key,request);try{return await request}catch(e){inflight.delete(key);throw e}finally{if(isCatalogue)inflight.delete(key)}
  }
  const reader=async url=>parseSource(await raw(url));reader.raw=raw;reader.metrics=()=>({...metrics});reader.close=cleanup;return reader;
 }catch(e){await cleanup();throw e}
}
