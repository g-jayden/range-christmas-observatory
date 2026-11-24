/* Lossless transport for large catalogue JSON on the static Pages host. */
(()=>{
 if(globalThis.__observatoryJsonTransport)return;
 const native=globalThis.fetch.bind(globalThis),script=document.currentScript,base=new URL('.',script.src),index=new URL('static-json-index.json',base),safe=/^[a-zA-Z0-9_./-]+\.json\.[a-f0-9]{20}\.gz$/;
 let pending;
 const manifest=refresh=>{if(refresh)pending=undefined;return pending??=native(index.href,{cache:'no-cache',priority:'high'}).then(async r=>{if(!r.ok)return null;const j=await r.json();return j.version==='lossless-static-json-v1'&&j.files?j:null;}).catch(()=>null);};
 const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
 async function read(input,init){
  let u;try{u=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,base);}catch{return native(input,init);}
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  if(method!=='GET'||u.origin!==base.origin||!u.pathname.startsWith(base.pathname)||!u.pathname.endsWith('.json')||u.href===index.href)return native(input,init);
  const key=decodeURIComponent(u.pathname.slice(base.pathname.length)),m=await manifest();let entry=m?.files[key];if(!entry)return native(input,init);
  for(let attempt=0;attempt<2;attempt++){
   if(!safe.test(entry.url)||entry.url.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0)throw Error('Invalid static catalogue transport identity');
   const target=new URL(entry.url,base);if(target.origin!==base.origin||!target.pathname.startsWith(base.pathname))throw Error('Static catalogue transport escaped its site');
   const opts={...init,method:'GET'};if(input&&typeof input==='object'&&!(input instanceof URL))for(const field of ['headers','credentials','mode','cache','signal','referrerPolicy'])if(opts[field]===undefined&&input[field]!==undefined)opts[field]=input[field];
   const r=await native(target.href,opts);
   if([404,410].includes(r.status)&&attempt===0){const next=(await manifest(true))?.files[key];if(next&&next.url!==entry.url){entry=next;continue;}}
   if(!r.ok)return r;
   let bytes=new Uint8Array(await r.arrayBuffer());
   if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream!=='function')throw Error('此浏览器缺少目录解压支持，请更新浏览器 · Update the browser to open this catalogue');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
   if(bytes.length!==entry.bytes||await hash(bytes)!==entry.sha256)throw Error('目录内容校验失败 · Catalogue transport digest mismatch');
   const headers=new Headers(r.headers);headers.delete('content-encoding');headers.set('content-type','application/json; charset=utf-8');headers.set('content-length',String(bytes.length));
   return new Response(bytes,{status:r.status,statusText:r.statusText,headers});
  }
 }
 globalThis.fetch=read;globalThis.__observatoryJsonTransport={version:'lossless-static-json-v1',base:base.href};manifest();
})();
