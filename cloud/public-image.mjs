const HOSTS=new Set(['www.therange.co.uk','media.4rgos.it','asda.scene7.com','assets.digitalcontent.marksandspencer.app','cdn.bmstores.co.uk','media.home.bargains','images.dunelm.com','xcdn.next.co.uk','media.johnlewiscontent.com','ml.thcdn.com','media.diy.com','raw.githubusercontent.com','cdn.shopify.com']);
export function allowedPublicImage(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname))return false;if(u.hostname==='cdn.shopify.com'&&(!/^\/s\/files\/1\/1032\/7795\/3356\/(?:files|products)\/.+\.(?:jpe?g|png|webp|avif|gif)$/i.test(u.pathname)||[...u.searchParams.keys()].some(k=>k!=='v')))return false;if(u.hostname==='raw.githubusercontent.com'&&!/^\/g-jayden\/range-christmas-observatory\/(?:main|[a-f0-9]{40})\/web\/(?:images|mail-assets)\//.test(u.pathname))return false;return true;}catch{return false;}}
const imageError=(text,status)=>new Response(text,{status,headers:{'access-control-allow-origin':'https://g-jayden.github.io','cache-control':'no-store','x-content-type-options':'nosniff'}});
const transfers=new Map();
function immutableOriginal(raw){const u=new URL(raw);if(u.origin!=='https://raw.githubusercontent.com'||u.search)return null;const m=u.pathname.match(/^\/g-jayden\/range-christmas-observatory\/(?:main|[a-f0-9]{40})\/web\/images\/source\/([a-f0-9]{64})\.(jpg|png|webp|avif|gif)$/);return m&&{hash:m[1],file:m[1]+'.'+m[2]};}
export async function publicImage(req,{cache=globalThis.caches?.default,fetcher=fetch,waitUntil=()=>{}}={}){
 const url=new URL(req.url);if(url.pathname!=='/public/image')return null;if(req.method!=='GET')return imageError('Method not allowed',405);
 let source=url.searchParams.get('url');if(!allowedPublicImage(source))return imageError('Source not allowed',400);
 const original=immutableOriginal(source),keyUrl=new URL('/public/image',url.origin);
 // The bytes named by this digest are shared across commit URLs. Mutable retail
 // CDN URLs retain their short lifetime and never receive immutable caching.
 keyUrl.searchParams.set('url',original?'https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/images/source/'+original.file:new URL(source).href);
 if(original)keyUrl.searchParams.set('verified','sha256-v1');
 const key=new Request(keyUrl),cached=cache&&await cache.match(key);if(cached)return cached;
 let task=transfers.get(key.url);
 if(!task){task=(async()=>{
  let r;for(let n=0;n<3;n++){r=await fetcher(source,{redirect:'manual',signal:AbortSignal.timeout(25000)});if(r.status<300||r.status>=400)break;const next=r.headers.get('location');source=next&&new URL(next,source).href;if(!allowedPublicImage(source))return imageError('Redirect not allowed',502);}
  if(!r.ok)return imageError('Official source image HTTP '+r.status,502);const type=r.headers.get('content-type')||'';if(!/^image\/(?:jpeg|png|webp|avif|gif)(?:;|$)/i.test(type)||Number(r.headers.get('content-length'))>25000000)return imageError('Unsupported source image',502);
  const data=await r.arrayBuffer();if(data.byteLength>25000000)return imageError('Source image too large',413);
  if(original){const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');if(actual!==original.hash)return imageError('Original image digest does not match its recorded bytes',502);}
  const response=new Response(data,{headers:{'content-type':type,'cache-control':original?'public,max-age=31536000,immutable':'public,max-age=3600','access-control-allow-origin':'https://g-jayden.github.io','x-content-type-options':'nosniff',...(original?{'x-image-sha256':original.hash,etag:'"'+original.hash+'"'}:r.headers.get('etag')?{etag:r.headers.get('etag')}:{})}});
  if(cache)waitUntil(cache.put(key,response.clone()));return response;
 })();transfers.set(key.url,task);task.finally(()=>{if(transfers.get(key.url)===task)transfers.delete(key.url);}).catch(()=>{});}
 try{return(await task).clone();}catch{return imageError('Official source image transfer failed',502);}
}
