// Image-only page reads. Do not return or promote descriptions, prices, sizes,
// materials or PDP verification: these remain subject to their source policy.
export async function readRangeImageGalleries({products,lookup,concurrency=4,timeoutMs=7000}){
 const normal=raw=>{try{const u=new URL(raw);if(u.origin!=='https://www.therange.co.uk'||u.username||u.password||u.port||/[\u0000-\u001f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw))return null;u.hash='';u.search='';u.pathname=u.pathname.replace(/\/+$/,'');return u.href;}catch{return null;}};
 const media=(raw,base)=>{try{const u=new URL(String(raw||'').replaceAll('&amp;','&'),base);return u.protocol==='https:'&&['www.therange.co.uk','kube-media-unpublished.rstore.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port&&/^\/media\/.+\.(?:jpe?g|png|webp|avif|gif)$/i.test(u.pathname)?u.href:null;}catch{return null;}};
 const read=async(url,json)=>{try{const r=await fetch(url,{credentials:'include',cache:'no-store',headers:json?{'X-Requested-With':'XMLHttpRequest',accept:'application/json'}:undefined,signal:AbortSignal.timeout(timeoutMs)});if(r.status!==200||new URL(r.url||url).origin!=='https://www.therange.co.uk')return{status:r.status};return{status:200,body:json?await r.json():await r.text()};}catch(e){return{status:0,error:String(e.message).slice(0,100)};}};
 const results=[],deadline=Date.now()+44000;let cursor=0;
 await Promise.all(Array.from({length:Math.min(concurrency,products.length)},async()=>{while(cursor<products.length&&Date.now()<deadline){const p=products[cursor++],sku=String(p.sku),attempts=[];let pageUrl=normal(p.sourceUrl),found=null;
  for(let attempt=0;attempt<2;attempt++){
   if(pageUrl){const [json,html]=await Promise.all([read(pageUrl+'?json',true),read(pageUrl,false)]);attempts.push({pageUrl,jsonStatus:json.status,htmlStatus:html.status});
    if(json.status===200&&html.status===200){const variants=json.body?.variant_arr||[],v=variants.find(v=>String(v.sku)===sku&&String(v.code).replace(/^0+(?=\d)/,'')===sku&&(!p.variantId||String(v.id)===String(p.variantId))),doc=new DOMParser().parseFromString(html.body,'text/html');
     let family=doc.querySelector('#product_id')?.value;
     if(!family)for(const script of doc.querySelectorAll('script:not([src])')){family=script.textContent.match(/gtm_product_data\s*=\s*\[[\s\S]*?["']prod_id["']\s*:\s*["']?(\d+)/)?.[1];if(family)break;}
     if(v&&/^\d+$/.test(String(family))&&String(v.prod_id)===String(family)){
      const images=[];for(const a of doc.querySelectorAll('#available-imgs a.rsImg, #product-gallery a.rsImg')){const img=a.querySelector('img[data-variant]'),ids=(img?.getAttribute('data-variant')||a.getAttribute('data-variant')||'').split(',').map(s=>s.trim());if(!ids.includes(String(v.id)))continue;const url=media(a.getAttribute('href')||a.getAttribute('data-rsBigImg'),pageUrl);if(!url||images.some(g=>g.url===url))continue;images.push({url,thumbnail:media(img?.getAttribute('src')||a.getAttribute('data-rsTmb'),pageUrl),selectedSku:sku,variantId:String(v.id),source:pageUrl});}
      if(images.length){found={sku,inputSourceUrl:p.sourceUrl,sourceUrl:pageUrl,listingImageUrl:p.variantImageUrl||p.imageUrl,variantId:String(v.id),productId:String(family),images,observedAt:new Date().toISOString(),method:'official-exact-SKU-image-gallery-only'};break;}
     }
    }
   }
   if(attempt===0&&lookup&&Date.now()<deadline){try{const links=await lookup({products:[p],concurrency:1});pageUrl=normal(links[0]?.sourceUrl);}catch{pageUrl=null;}}else pageUrl=null;
  }
  results.push(found||{sku,inputSourceUrl:p.sourceUrl,images:[],attempts,error:'Exact-SKU official native gallery unavailable'});
 }}));while(cursor<products.length){const p=products[cursor++];results.push({sku:String(p.sku),inputSourceUrl:p.sourceUrl,images:[],deferred:true,error:'Bounded image gallery discovery deadline'});}return results;
}

export function acceptedImageGallery(product,result){
 if(result?.method!=='official-exact-SKU-image-gallery-only'||String(result.sku)!==String(product.sku)||result.inputSourceUrl!==product.sourceUrl||result.listingImageUrl!==(product.variantImageUrl||product.imageUrl)||product.variantId&&String(result.variantId)!==String(product.variantId)||!/^\d+$/.test(result.productId||'')||!Number.isFinite(Date.parse(result.observedAt))||!result.images?.length)return false;
 try{if(new URL(result.sourceUrl).origin!=='https://www.therange.co.uk')return false;}catch{return false;}
 return result.images.every(g=>{try{const u=new URL(g.url);return String(g.selectedSku)===String(product.sku)&&String(g.variantId)===String(result.variantId)&&g.source===result.sourceUrl&&u.protocol==='https:'&&['www.therange.co.uk','kube-media-unpublished.rstore.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port&&/^\/media\/.+\.(?:jpe?g|png|webp|avif|gif)$/i.test(u.pathname);}catch{return false;}});
}
