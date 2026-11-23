// Start the current catalogue while the module graph loads. Only immutable
// same-site first-screen files are warmed; product originals stay untouched.
(()=>{
 const base=new URL('.',location.href).href,first=new Map,reads=new Map;
 const boot=globalThis.__observatoryCatalogueBootstrap={base,first,reads};
 const read=file=>fetch(new URL(file,base),{cache:'no-cache',priority:'high'}).then(r=>{if(!r.ok)throw Error('Catalogue bootstrap HTTP '+r.status);return r.json();});
 for(const file of ['browse-status.json','product-identities.json']){const work=read(file);work.catch(()=>{});reads.set(file,work);}
 const safe=e=>e&&/^browse\/[a-z][a-z0-9-]*\.[a-f0-9]{20}\.json$/.test(e.url)&&/^[a-f0-9]{64}$/.test(e.sha256);
 const warm=(entry,priority)=>{if(!safe(entry)||first.has(entry.url))return first.get(entry?.url);const task=fetch(new URL(entry.url,base),{cache:'force-cache',priority}).then(async r=>{if(!r.ok)throw Error('First screen HTTP '+r.status);const text=await r.text();if(text.length>2000000)throw Error('First screen exceeds warmup bound');return text;});first.set(entry.url,task);task.catch(()=>first.delete(entry.url));return task;};
 boot.manifest=read('browse-index.json').then(m=>m?.format==='immutable-department-views-v1'&&m.scopes?m:null).catch(()=>null);
 boot.manifest.then(m=>{if(!m)return;const query=new URL(location.href).searchParams,id=query.get('scope')||(query.get('collection')==='spring'?'spring-stems':'tree');warm(m.scopes[id]?.firstScreen,'high');
  if(navigator.connection?.saveData||/^(?:slow-)?2g$/.test(navigator.connection?.effectiveType||''))return;
  const defaults=['spring-stems','tree','asda-tree','bm-tree','ms-baubles','hb-baubles','du-tree','nx-baubles','jl-baubles','mt-baubles','bq-tree','ar-tree'];
  const start=()=>{let at=0;const next=async()=>{while(at<defaults.length){const nextId=defaults[at++];if(nextId===id||(m.scopes[nextId]?.firstScreen?.bytes||0)>600000)continue;try{await warm(m.scopes[nextId]?.firstScreen,'low');}catch{}}};next();next();};
  if(globalThis.requestIdleCallback)requestIdleCallback(start,{timeout:2000});else setTimeout(start,300);
 });
})();
