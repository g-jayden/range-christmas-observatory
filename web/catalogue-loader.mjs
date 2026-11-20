const PATH=/^browse\/[a-z][a-z0-9-]*\.[a-f0-9]{20}\.json$/;
const CACHE='observatory-catalogue-views-v1',MAX_BYTES=64*1024*1024;
let writes=Promise.resolve();
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function createCatalogueLoader({fetcher=fetch,disk=globalThis.caches,base=globalThis.location?.href||'https://catalogue.invalid/'}={}){
 let manifestPromise;const requests=new Map(),ready=new Map();
 const url=file=>new URL(file,base).href;
 function manifest(){return manifestPromise??=fetcher(url('browse-index.json'),{cache:'no-cache'}).then(async r=>{if(!r.ok)return null;const m=await r.json();return m.format==='immutable-department-views-v1'&&m.scopes?m:null;}).catch(()=>null);}
 async function parse(text,entry,id){if(await sha(text)!==entry.sha256)throw Object.assign(Error('目录版本校验失败 · Catalogue digest mismatch'),{integrityMismatch:true});const data=JSON.parse(text);if(data.browseScope!==id||!Array.isArray(data.products))throw Error('分类目录不匹配 · Department mismatch');return data;}
 function persist(target,text){if(!disk)return;writes=writes.catch(()=>{}).then(async()=>{try{const cache=await disk.open(CACHE);await cache.put(target,new Response(text,{headers:{'content-type':'application/json','content-length':String(new TextEncoder().encode(text).length),'x-stored-at':String(Date.now())}}));const entries=await Promise.all((await cache.keys()).map(async key=>{const r=await cache.match(key);return {key,size:Number(r?.headers.get('content-length'))||0,at:Number(r?.headers.get('x-stored-at'))||0};}));let total=entries.reduce((n,e)=>n+e.size,0);for(const e of entries.sort((a,b)=>a.at-b.at)){if(total<=MAX_BYTES)break;await cache.delete(e.key);total-=e.size;}}catch{/* Browser storage is optional; the verified response is already usable. */}});}
 async function load(id,legacy,attempt=0,firstScreen=false){const m=await manifest(),scope=m?.scopes[id],entry=firstScreen?(scope?.firstScreen||scope):scope;if(!entry||!PATH.test(entry.url)||!/^[a-f0-9]{64}$/.test(entry.sha256))return legacy();
  const key=id+'/'+entry.sha256;if(ready.has(key))return ready.get(key);if(requests.has(key))return requests.get(key);
  const work=(async()=>{const target=url(entry.url);if(disk)try{const cache=await disk.open(CACHE),r=await cache.match(target);if(r)try{return await parse(await r.text(),entry,id);}catch{await cache.delete(target);}}catch{}
   const r=await fetcher(target,{cache:'force-cache',priority:firstScreen?'high':'low',signal:AbortSignal.timeout(firstScreen?20000:120000)});if(!r.ok)throw Object.assign(Error('分类目录 HTTP '+r.status),{status:r.status});const text=await r.text(),data=await parse(text,entry,id);persist(target,text);return data;})();requests.set(key,work);try{const data=await work;ready.set(key,data);while(ready.size>8)ready.delete(ready.keys().next().value);return data;}catch(error){
   if(attempt===0&&([404,410].includes(error.status)||error.integrityMismatch)){if(await manifest()===m)manifestPromise=undefined;const latest=await manifest(),nextScope=latest?.scopes[id],next=firstScreen?(nextScope?.firstScreen||nextScope):nextScope;if(next&&next.sha256!==entry.sha256)return load(id,legacy,1,firstScreen);if([404,410].includes(error.status)&&typeof legacy==='function')return legacy();}
   throw error;
  }finally{requests.delete(key);}
 }
 return {load,loadFirst:(id,legacy)=>load(id,()=>load(id,legacy),0,true),refresh(){manifestPromise=undefined;},async check(){const before=await manifest();manifestPromise=undefined;const after=await manifest();if(!after)return [];return Object.keys(after.scopes).filter(id=>before?.scopes[id]?.sha256!==after.scopes[id].sha256);},idle:()=>writes};
}
