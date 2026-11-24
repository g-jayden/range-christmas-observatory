// Give the direct CDN a head start; do not make a blocked client wait for its
// full timeout before the owner's cached image endpoint is even attempted.
export async function downloadNativeImage(url,{fetcher=fetch,proxyForUrl,hedgeDelayMs,timeoutMs=30000}={}) {
 hedgeDelayMs??=/^https:\/\/raw\.githubusercontent\.com\/g-jayden\/range-christmas-observatory\/(?:main|[a-f0-9]{40})\/web\/images\/source\/[a-f0-9]{64}\.(?:jpg|png|webp|avif|gif)$/.test(url)?0:350;
 const controllers=[],timers=[];
 const read=async target=>{const controller=new AbortController();controllers.push(controller);timers.push(setTimeout(()=>controller.abort(),timeoutMs));const r=await fetcher(target,{credentials:'omit',signal:controller.signal});if(!r.ok)throw Error('Image HTTP '+r.status);if(Number(r.headers.get('content-length'))>25000000)throw Error('Source image exceeds file guard');const blob=await r.blob();if(!blob.type.startsWith('image/')||blob.size>25000000)throw Error('Source did not return a supported image');return blob;};
 try {
  const direct=read(url);if(!proxyForUrl||!/^https:\/\//.test(url))return await direct;
  const alternate=new Promise(resolve=>timers.push(setTimeout(resolve,hedgeDelayMs))).then(async()=>read(await proxyForUrl(url)));
  try{return await Promise.any([direct,alternate]);}catch(e){throw e.errors?.[0]||e;}
 } finally {for(const t of timers)clearTimeout(t);for(const c of controllers)c.abort();}
}
