// Read the bytes of images that the normal product page actually loaded.
// This is not an image screenshot, canvas export, guessed URL or modified
// client identity. It also avoids a second HTTP request for the same photo.
export async function captureProductImageResponses(page,p,{timeoutMs=15000}={}){
 const sku=String(p.sku),source=new URL(p.sourceUrl),normal=raw=>{try{const u=new URL(raw);if(u.protocol!=='https:'||!['www.therange.co.uk','kube-media-unpublished.rstore.com'].includes(u.hostname)||!u.pathname.startsWith('/media/'))return null;return 'https://www.therange.co.uk'+u.pathname+u.search;}catch{return null;}};
 if(source.origin!=='https://www.therange.co.uk'||source.hash.slice(1)!==sku||String(p.detailEvidence?.selectedSku)!==sku||!p.detailEvidence?.verifiedProductSection)throw Error('Native image recovery requires the verified exact-SKU product page');
 const urls=[...new Set([p.variantImageUrl||p.imageUrl,p.originalImageUrl].filter(Boolean))];if(!p.originalImageUrl||urls.some(u=>!normal(u)))throw Error('Native image URL is not a verified retailer media asset');
 const responses=new Map(),onResponse=r=>{const matches=urls.filter(url=>normal(url)===normal(r.url()));if(!matches.length||r.status()!==200||!r.headers()['content-type']?.startsWith('image/'))return;const body=r.body().then(bytes=>{if(!bytes.length||bytes.length>20000000)throw Error('Native image response has an invalid size');return bytes;});body.catch(()=>{});for(const url of matches)responses.set(url,body);};
 page.on('response',onResponse);
 try{
  const r=await page.goto(p.sourceUrl,{waitUntil:'domcontentloaded',timeout:30000});if(!r||r.status()>=400)throw Object.assign(Error('Native product page unavailable'),{status:r?.status()||0});
  await page.waitForFunction(expected=>(document.querySelector('#product-dyn-code')?.textContent||'').trim().replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'')===expected,sku,{timeout:timeoutMs});
  if(p.variantImageUrl)await page.evaluate(preferred=>{Array.from(document.querySelectorAll('#product-gallery .rsThumb img')).find(i=>i.src===preferred)?.parentElement?.click();},p.variantImageUrl);
  await page.waitForFunction(url=>Array.from(document.images).some(i=>(i.currentSrc||i.src)===url&&i.complete&&i.naturalWidth>=64&&i.naturalHeight>=64),p.originalImageUrl,{timeout:timeoutMs});
  const images=[],failures=[];for(const url of urls)try{if(!responses.has(url))throw Error('Browser did not expose the native image response body');images.push({url,bytes:await responses.get(url),selectedSku:sku,sourceContextUrl:p.sourceUrl});}catch(e){failures.push({url,error:String(e.message).slice(0,180)});}
  return {sku,images,failures};
 }finally{page.off('response',onResponse);}
}
