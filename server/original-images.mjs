import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {atomicJson} from './sync.mjs';
import {validProductImage} from './details.mjs';
export const ORIGINAL_MAP_VERSION='official-available-imgs-v1';
const family=p=>p.sourceUrl.split('#')[0].replace(/\/$/,'');
export const originalInput=p=>createHash('sha256').update(JSON.stringify({version:ORIGINAL_MAP_VERSION,sku:p.sku,url:family(p),variantId:p.variantId||null,hero:p.variantImageUrl,listing:p.listingVariantImageUrl||p.imageUrl})).digest('hex');
// Executed in the existing Firecrawl retailer page, one HTML read per family.
export async function readOriginalPages({families,concurrency=12}){
 const results=[];let cursor=0;const deadline=Date.now()+45000;
 await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<families.length&&Date.now()<deadline){const item=families[cursor++];try{
  if(new URL(item.url).origin!=='https://www.therange.co.uk')throw Error('Unexpected source origin');
  const r=await fetch(item.url,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(12000)});if(r.status!==200){results.push({url:item.url,status:r.status});continue;}
  const doc=new DOMParser().parseFromString(await r.text(),'text/html');let product;for(const s of doc.querySelectorAll('script[type="application/ld+json"]'))try{const x=JSON.parse(s.textContent.replace(/[\u0000-\u001f]/g,' '));if(x['@type']==='Product')product=x;}catch{}
  const anchors=[...doc.querySelectorAll('#available-imgs a.rsImg, #product-gallery a.rsImg')];
  const pairs=anchors.map(a=>{const img=a.querySelector('img[data-variant]');return {url:a.getAttribute('data-rsbigimg')||a.getAttribute('href'),thumbnail:img?.getAttribute('src'),variants:(img?.getAttribute('data-variant')||a.closest('[data-variant]')?.getAttribute('data-variant')||'').split(',').map(x=>x.trim()).filter(Boolean)}});
  const offers=product?.offers?.offers||[product?.offers];
  results.push({url:item.url,status:200,product:!!product||!!doc.querySelector('#product_id')?.value,offers:offers.filter(Boolean).map(o=>String(o.sku)),pairs});
 }catch(e){results.push({url:item.url,status:0,error:e.message})}}}));
 while(cursor<families.length)results.push({url:families[cursor++].url,status:0,deferred:true});return results;
}
export function selectOriginals(p,result){
 if(result.status!==200||!result.product)return null;
 const abs=u=>{try{const v=new URL(u,result.url);return v.origin==='https://www.therange.co.uk'&&validProductImage(v.href)?v.href:null}catch{return null}};
 const known=new Set([p.variantImageUrl,p.listingVariantImageUrl,...p.images||[]].filter(Boolean));
 const pairs=result.pairs.map(g=>({...g,url:abs(g.url),thumbnail:abs(g.thumbnail)})).filter(g=>g.url);
 const matched=pairs.filter(g=>known.has(g.thumbnail)||known.has(g.url)),variantIds=new Set(matched.flatMap(g=>g.variants));
 const selected=p.variantId?pairs.filter(g=>g.variants.includes(String(p.variantId))):variantIds.size===1?pairs.filter(g=>g.variants.includes([...variantIds][0])):matched;
 if(!selected.length)return null;
 const sku=String(p.sku).replace(/^0+(?=\d)/,''),claimed=result.offers.some(s=>s.replace(/^0+(?=\d)/,'')===sku),prior=p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===p.sku;
 if(!claimed&&!prior)return null;
 const originals=[...new Map(selected.map(g=>[g.url,{url:g.url,thumbnail:g.thumbnail,variantId:p.variantId||null,source:result.url,selectedSku:p.sku}])).values()];
 const hero=originals.find(g=>g.thumbnail===p.variantImageUrl)||originals.find(g=>g.url===p.originalImageUrl)||originals.find(g=>g.thumbnail===p.listingVariantImageUrl)||originals[0];
 return {version:ORIGINAL_MAP_VERSION,fingerprint:originalInput(p),sku:p.sku,sourceUrl:result.url,originalImageUrl:hero.url,originalImages:originals,observedAt:new Date().toISOString(),method:p.variantId?'official-hidden-gallery-exact-variant':'official-hidden-gallery-verified-SKU-photo-pairs'};
}
function matchesOriginal(p,saved){
 if(!saved||String(saved.sku)!==String(p.sku))return false;
 if(saved.fingerprint===originalInput(p))return true;
 // Some compact category records omit the internal variant ID. Share the
 // verified SKU/photo mapping without accepting a conflicting known variant.
 const ids=[...new Set((saved.originalImages||[]).map(g=>g.variantId).filter(Boolean))];
 if(!p.variantId&&ids.length===1)return saved.fingerprint===originalInput({...p,variantId:ids[0]});
 if(p.variantId&&ids.length===0&&saved.originalImages?.every(g=>g.selectedSku===p.sku))return saved.fingerprint===originalInput({...p,variantId:null});
 return false;
}
export function applyOriginal(p,saved){if(!matchesOriginal(p,saved)||p.originalImageUrl&&Date.parse(p.originalSourceEvidence?.observedAt)>Date.parse(saved.observedAt))return false;p.originalImageUrl=saved.originalImageUrl;p.originalImages=saved.originalImages;p.originalSourceEvidence={version:saved.version,sourceUrl:saved.sourceUrl,selectedSku:p.sku,observedAt:saved.observedAt,method:saved.method,fingerprint:saved.fingerprint};return true;}
export async function mapOriginalImages(products,reader,{batchSize=400}={}){
 const unique=[...new Map(products.map(p=>[p.sku,p])).values()],buckets=new Map();for(let n=0;n<100;n++){const key=String(n).padStart(2,'0');buckets.set(key,await fs.readFile('web/original-image-map/'+key+'.json','utf8').then(JSON.parse).catch(()=>({})));}
 const pending=[],issues=[];let reused=0,mapped=0;for(const p of unique){const saved=buckets.get(p.sku.slice(-2).padStart(2,'0'))[p.sku];if(applyOriginal(p,saved)){reused++;continue;}if(p.originalImageUrl&&p.originalImages?.some(g=>g.url===p.originalImageUrl&&(g.selectedSku===p.sku||p.variantId&&String(g.variantId)===String(p.variantId)))){reused++;continue;}if(p.detailsReady||p.detailEvidence?.verifiedProductSection)pending.push(p);}
 const groups=new Map();for(const p of pending){const key=family(p);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}const urls=[...groups.keys()];
 for(let n=0;n<urls.length;n+=batchSize){const chosen=urls.slice(n,n+batchSize),results=await reader.batchDocuments(readOriginalPages,{families:chosen.map(url=>({url}))});
  if(results.length!==chosen.length||new Set(results.map(r=>r.url)).size!==chosen.length||results.some(r=>!chosen.includes(r.url)))throw Error('Original-image family batch did not reconcile');
  if(n===0&&results.filter(r=>r.status!==200||!r.product).length>results.length*.8)throw Error('Original-image HTML channel unavailable; stopped before further paid batches');
  const dirty=new Set();for(const result of results)for(const p of groups.get(result.url)){const saved=selectOriginals(p,result);if(saved){applyOriginal(p,saved);const key=p.sku.slice(-2).padStart(2,'0');buckets.get(key)[p.sku]=saved;dirty.add(key);mapped++;}else issues.push({sku:p.sku,url:result.url,status:result.status,reason:result.status===200?'No verified same-SKU original image map':result.error||'Source unavailable'});}
  for(const key of dirty)await atomicJson('web/original-image-map/'+key+'.json',buckets.get(key));
  console.log(JSON.stringify({phase:'official-original-images',families:Math.min(n+batchSize,urls.length),familyTotal:urls.length,mapped,reused,issues:issues.length}));
 }
 for(const p of products){const saved=buckets.get(p.sku.slice(-2).padStart(2,'0'))[p.sku];applyOriginal(p,saved);}return {version:ORIGINAL_MAP_VERSION,products:unique.length,families:urls.length,mapped,reused,issues};
}

export async function restoreOriginalImages(products){const buckets=new Map();let restored=0;for(const p of products){const key=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(key))buckets.set(key,await fs.readFile('web/original-image-map/'+key+'.json','utf8').then(JSON.parse).catch(()=>({})));if(applyOriginal(p,buckets.get(key)[p.sku]))restored++;}return restored;}
