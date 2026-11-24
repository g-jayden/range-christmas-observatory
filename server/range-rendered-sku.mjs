import {createHash} from 'node:crypto';
import {ProductDOMParser} from './range-free-source.mjs';
import {browserMarkdown} from './free-source.mjs';
import {parseDetails} from './details.mjs';
// A rendered official PDP can remain valid when its old JSON route redirects
// incorrectly. Bind the selected DOM SKU, catalogue family and native gallery
// variant together before accepting any specification from that page.
export function parseRenderedRangeSku(response,p,{observedAt=new Date().toISOString()}={}){
 const data=response?.data,metadata=data?.metadata;
 if(response?.success!==true||metadata?.statusCode!==200||!data.rawHtml)throw Error('Successful rendered official product page required');
 const doc=new ProductDOMParser().parseFromString(data.rawHtml,'text/html'),plain=n=>String(n?.textContent||'').replace(/\s+/g,' ').trim(),selected=plain(doc.querySelector('#product-dyn-code')).replace(/^[PM]/i,'').replace(/^0+(?=\d)/,'');
 if(selected!==String(p.sku).replace(/^0+(?=\d)/,''))throw Error('Rendered product selected another SKU');
 const normalize=raw=>{const u=new URL(raw);if(u.origin!=='https://www.therange.co.uk'||u.username||u.password)throw Error('Official product origin required');return u.origin+u.pathname.replace(/\/$/,'');};
 const requested=normalize(p.sourceUrl),canonical=normalize(new URL(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')||metadata.url||metadata.sourceURL,p.sourceUrl).href),reported=normalize(metadata.sourceURL||metadata.url);
 if(reported!==requested&&reported!==canonical||metadata.url&&normalize(metadata.url)!==canonical)throw Error('Rendered source URL does not match requested or observed canonical page');
 let family=doc.querySelector('#product_id')?.getAttribute('value');
 for(const script of doc.querySelectorAll('script:not([src])'))if(!family){const m=script.textContent.match(/gtm_product_data\s*=\s*(\[[\s\S]*?\])\s*;/);family=m?.[1].match(/["']prod_id["']\s*:\s*["']?(\d+)/)?.[1];}
 if(!/^\d+$/.test(String(p.id))||String(family)!==String(p.id))throw Error('Rendered product family does not match catalogue SKU');
 const originalImages=[];for(const a of doc.querySelectorAll('#available-imgs a.rsImg,#product-gallery a.rsImg')){
  const img=a.querySelector('img[data-variant]'),ids=(img?.getAttribute('data-variant')||a.getAttribute('data-variant')||'').split(',').map(x=>x.trim());if(!ids.includes(String(p.variantId)))continue;
  let u;try{u=new URL(a.getAttribute('href')||a.getAttribute('data-rsBigImg'),canonical);}catch{continue;}
  if(u.protocol!=='https:'||!['www.therange.co.uk','kube-media-unpublished.rstore.com'].includes(u.hostname)||!/^\/media\/.+\.(?:jpe?g|png|webp|avif|gif)$/i.test(u.pathname)||originalImages.some(g=>g.url===u.href))continue;
  originalImages.push({url:u.href,thumbnail:img?.getAttribute('src')||null,variantId:String(p.variantId),selectedSku:String(p.sku),source:canonical,method:'rendered-exact-SKU-and-native-gallery-variant'});
 }
 if(!originalImages.length)throw Error('Rendered gallery cannot confirm catalogue variant');
 const features=Array.from(doc.querySelectorAll('#product-dyn-features-ul li')).map(plain),specs=Array.from(doc.querySelectorAll('#product-dyn-specification-ul li')).map(plain),description=doc.querySelector('#product-description')?.cloneNode(true);description?.querySelectorAll('script,style').forEach(n=>n.remove());
 if(!features.length||!specs.some(s=>/^[^:]+:\s*\S/.test(s)))throw Error('Rendered exact SKU feature/specification sections are incomplete');
 const sourceUrl=canonical+'#'+p.sku,markdown=browserMarkdown({features,specs,information:plain(description)}),d=parseDetails({success:true,data:{...data,markdown}},p.sku,sourceUrl,observedAt);
 const exactVariantSource={version:1,selectedSku:String(p.sku),variantId:String(p.variantId),sourceUrl:canonical,description:plain(description),features,observedAt,variantIdBinding:'complete-root-SKU-and-rendered-native-gallery-data-variant',catalogueProductId:String(p.id)};exactVariantSource.sha256=createHash('sha256').update(JSON.stringify(exactVariantSource)).digest('hex');
 return{...d,sourceUrl,originalImages,images:originalImages.map(g=>g.url),image:originalImages[0].thumbnail||originalImages[0].url,exactVariantSource,verificationMethod:'official-rendered-exact-SKU-DOM-family-and-native-variant',sourceTransport:metadata.provider||'live-firecrawl-rendered-product-page',sourceRedirectEvidence:{method:'observed-official-rendered-PDP-canonical',requestedUrl:p.sourceUrl,resolvedUrl:canonical,selectedSku:String(p.sku),variantId:String(p.variantId),productId:String(p.id),scrapeId:metadata.scrapeId||null}};
}
