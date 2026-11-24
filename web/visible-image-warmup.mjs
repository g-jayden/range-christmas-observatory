// Every product approaching the viewport is prepared, including later pages.
// Disconnecting prevents stale renders from refilling the new scope's queue.
export function observeProductImages(root,products,{keyOf,resolveProduct,warm,signal,Observer=globalThis.IntersectionObserver,saveData=globalThis.navigator?.connection?.saveData}={}){
 const rows=new Map(products.map(p=>[keyOf(p),p])),started=new Set();let stopped=false,observer;
 const start=node=>{if(stopped||signal?.aborted||!node.isConnected)return;const key=node.dataset.previewKey,p=rows.get(key);if(!p||started.has(key))return;started.add(key);
  Promise.resolve().then(()=>resolveProduct(p)).then(full=>{if(!stopped&&!signal?.aborted&&node.isConnected)return warm(full);}).catch(()=>{});
 };
 const stop=()=>{stopped=true;observer?.disconnect();signal?.removeEventListener('abort',stop);};
 if(signal?.aborted||saveData)return stop;
 const nodes=[...root.querySelectorAll('[data-preview-key]')];
 if(Observer){observer=new Observer(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);start(e.target);}},{rootMargin:'1200px 0px',threshold:0});for(const node of nodes)observer.observe(node);}
 else for(const node of nodes)start(node);
 signal?.addEventListener('abort',stop,{once:true});return stop;
}
