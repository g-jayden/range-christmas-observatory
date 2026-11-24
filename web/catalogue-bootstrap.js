// Start the current catalogue while the module graph loads. Only immutable
// same-site first-screen files are warmed; product originals stay untouched.
(()=>{
 const base=new URL('.',location.href).href,first=new Map,reads=new Map,warming=new Map;let pausedUntil=0;
 const boot=globalThis.__observatoryCatalogueBootstrap={base,first,reads};
 const read=file=>fetch(new URL(file,base),{cache:'no-cache',priority:'high'}).then(r=>{if(!r.ok)throw Error('Catalogue bootstrap HTTP '+r.status);return r.json();});
 for(const file of ['browse-status.json','product-identities.json']){const work=read(file);work.catch(()=>{});reads.set(file,work);}
 const safe=e=>e&&/^browse\/[a-z][a-z0-9-]*\.[a-f0-9]{20}\.json$/.test(e.url)&&/^[a-f0-9]{64}$/.test(e.sha256);
 const warm=(entry,priority)=>{if(!safe(entry)||first.has(entry.url))return first.get(entry?.url);const state={controller:new AbortController,priority,settled:false};const task=fetch(new URL(entry.url,base),{cache:'force-cache',priority,signal:state.controller.signal}).then(async r=>{if(!r.ok)throw Error('First screen HTTP '+r.status);const text=await r.text();if(text.length>4000000)throw Error('First screen exceeds warmup bound');state.settled=true;state.bytes=text.length*2;for(const [url,old]of warming){if([...warming.values()].reduce((n,x)=>n+(x.bytes||0),0)<=16*1024*1024)break;if(url===entry.url||!old.settled)continue;if(first.get(url)===old.task)first.delete(url);warming.delete(url);}return text;});state.task=task;state.timer=setTimeout(()=>state.controller.abort(Object.assign(Error('Catalogue warmup deadline exceeded'),{name:'AbortError'})),15000);warming.set(entry.url,state);first.set(entry.url,task);task.then(()=>clearTimeout(state.timer),()=>clearTimeout(state.timer));task.catch(()=>{state.settled=true;if(first.get(entry.url)===task)first.delete(entry.url);if(warming.get(entry.url)===state)warming.delete(entry.url);});return task;};
 // A user's category must never wait for a low-priority speculative fetch.
 // Cancel only speculative first-screen work; collected facts and source
 // requests are untouched, and an old rejection cannot delete the new task.
 boot.promote=entry=>{if(!safe(entry))return;const selected=warming.get(entry.url);if(selected?.settled||selected?.priority==='high')return first.get(entry.url);pausedUntil=Date.now()+2000;for(const[url,state]of warming)if(state.priority==='low'&&!state.settled){if(first.get(url)===state.task)first.delete(url);warming.delete(url);state.controller.abort();}return warm(entry,'high');};
 boot.discard=(entry,expected)=>{if(!safe(entry)||first.get(entry.url)!==expected)return;first.delete(entry.url);const state=warming.get(entry.url);if(state?.task===expected){warming.delete(entry.url);clearTimeout(state.timer);if(!state.settled)state.controller.abort(Object.assign(Error('Abandoned catalogue preload'),{name:'AbortError'}));}};
 boot.manifest=read('browse-index.json').then(m=>m?.format==='immutable-department-views-v1'&&m.scopes?m:null).catch(()=>null);
 boot.manifest.then(m=>{if(!m)return;const query=new URL(location.href).searchParams,id=query.get('scope')||(query.get('collection')==='spring'?'spring-stems':'tree');warm(m.scopes[id]?.firstScreen,'high');
  if(navigator.connection?.saveData||/^(?:slow-)?2g$/.test(navigator.connection?.effectiveType||''))return;
  const retailer=m.scopes[id]?.retailerId,defaults=Object.keys(m.scopes).sort((a,b)=>Number(m.scopes[b].retailerId===retailer)-Number(m.scopes[a].retailerId===retailer));
  const start=()=>{let at=0;const next=async()=>{while(at<defaults.length){if(Date.now()<pausedUntil){await new Promise(resolve=>setTimeout(resolve,Math.min(2000,pausedUntil-Date.now())));continue;}const nextId=defaults[at++];if(nextId===id||(m.scopes[nextId]?.firstScreen?.bytes||0)>4000000)continue;try{await warm(m.scopes[nextId]?.firstScreen,'low');}catch{}}};next();};
  if(globalThis.requestIdleCallback)requestIdleCallback(start,{timeout:2000});else setTimeout(start,300);
 });
})();
