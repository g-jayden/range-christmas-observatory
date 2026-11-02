import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {classifyDecoration,productDimensions,decorationDepartments,decorationMemberships} from '../web/catalogue-model.mjs';
import {normaliseColors,materialFacts} from './appearance.mjs';
import {detailFingerprint,digest} from './collection-policy.mjs';
import {atomicJson,collectStableCategory} from './sync.mjs';
import {parseDetails,applyDetails} from './details.mjs';
export const DECORATION_SOURCE={id:'94578',url:'https://www.therange.co.uk/christmas/christmas-decorations/?sort=relevance&in_stock_f=true&page=1'};
export const emptyDecorations=()=>({version:1,products:[],history:{},ready:false,baselineReady:false,observedAt:null});
export async function readDecorations(){return fs.readFile('web/decorations.json','utf8').then(JSON.parse).catch(()=>emptyDecorations())}
export function mergeDecorations(previous,listing,observedAt=new Date().toISOString()){
 const old=new Map(previous.products.map(p=>[p.sku,p])),history={...previous.history};
 const products=listing.products.map(row=>{
  const sku=String(row.sku),prior=old.get(sku),h={...(history[sku]||{})};
  if(!h.firstObservedAt)h.firstObservedAt=observedAt;
  if(row.newIn&&!h.everNew){h.firstNewObservedAt=previous.baselineReady?observedAt:null;h.arrivalEvidence=previous.baselineReady?'observed-after-baseline':'initial-baseline';}
  h.everNew=Boolean(h.everNew||row.newIn);h.arrivalEvidence||=previous.baselineReady?'observed-after-baseline':'initial-baseline';history[sku]=h;
  const p={...prior,...row,sku,kind:'decoration',priceGBP:row.price/100,currency:'GBP',sourceUrl:'https://www.therange.co.uk/'+row.variantPath.replace('#','/#'),newStatus:row.newIn,newEvidence:{kind:'website_flag',field:'newIn',value:row.newIn,observedAt},observedAt,...h};
  p.listingVariantImageUrl=row.variantImageUrl||row.imageUrl;
  const fingerprint=detailFingerprint(p);if(prior?.detailInputFingerprint!==fingerprint){p.detailsReady=false;delete p.detailEvidence;delete p.specifications;delete p.sourceDescription;p.colorValues=[];p.treeColor='颜色待核验';p.dimensions=productDimensions();p.material='材质未注明 · Material not specified';}
  if((prior?.listingVariantImageUrl||prior?.variantImageUrl)!==p.listingVariantImageUrl){delete p.cachedImageUrl;delete p.imageCacheEvidence;delete p.paletteEvidence;}
  p.detailsReady=Boolean(p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===p.sku&&p.attributeObservedAt);p.detailInputFingerprint=fingerprint;const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;return p;
 });
 return {...previous,version:1,products,history,observedAt,source:{...DECORATION_SOURCE,...listing.audit},ready:false,revision:digest({at:observedAt,products:products.map(p=>[p.sku,p.priceGBP,p.newStatus,p.listingVariantImageUrl])})};
}
export async function loadDecorationDetails(products){
 const buckets=new Map();for(const p of products){const bucket=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(bucket))buckets.set(bucket,await fs.readFile('web/decoration-details/'+bucket+'.json','utf8').then(JSON.parse).catch(()=>({})));const saved=buckets.get(bucket)[p.sku];if(saved?.detailsReady===true&&saved.detailEvidence?.verifiedProductSection&&String(saved.detailEvidence.selectedSku)===p.sku&&saved.detailInputFingerprint===p.detailInputFingerprint&&!(p.detailEvidence?.verifiedProductSection&&Date.parse(p.attributeObservedAt)>=Date.parse(saved.attributeObservedAt))){for(const key of ['detailsReady','detailEvidence','attributeObservedAt','specifications','sourceDescription','dimensions','material','colorValues','treeColor','paletteEvidence','sourceColour','sourceMaterial','appearanceSource','images','originalImages','originalImageUrl','department','departmentIds','classificationEvidence','variantImageUrl','cachedImageUrl','imageCacheEvidence','imageSelectionEvidence','sourceListingImageUrl'])if(saved[key]!==undefined)p[key]=saved[key];p.detailsReady=true;}}
 return buckets;
}
export async function saveDecorationDetails(products){
 const buckets=new Map();for(const p of products){const bucket=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(bucket))buckets.set(bucket,{});buckets.get(bucket)[p.sku]=p;}
 for(const [bucket,rows]of buckets)await atomicJson('web/decoration-details/'+bucket+'.json',rows);
}
export const detailUrl=p=>'decoration-details/'+p.sku.slice(-2).padStart(2,'0')+'.json';
export function compactDecoration(p){
 const keys=['sku','kind','department','departmentIds','variantName','name','brand','priceGBP','originalPrice','currency','sourceUrl','listingVariantImageUrl','variantImageUrl','imageUrl','cachedImageUrl','imageCacheEvidence','newStatus','newEvidence','firstObservedAt','firstNewObservedAt','arrivalEvidence','everNew','observedAt','attributeObservedAt','detailInputFingerprint','detailsReady','dimensions','material','colorValues','treeColor','paletteEvidence','classificationEvidence','originalImageUrl','originalImageEvidence','mailAssets'];
 const out=Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));out.detailsReady=Boolean(p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===p.sku&&p.attributeObservedAt);out.detailsUrl=detailUrl(p);return out;
}
export async function updateDecorationDetails(snapshot,reader,{maxFamilies=Infinity,refreshAll=false,refreshAfter=null}={}){
 await loadDecorationDetails(snapshot.products);
 const selected=snapshot.products.filter(p=>refreshAll||!p.detailsReady||refreshAfter&&Date.parse(p.attributeObservedAt)<Date.parse(refreshAfter)),families=[...new Set(selected.map(p=>p.sourceUrl.split('#')[0].replace(/\/$/,'')))].slice(0,maxFamilies),wanted=new Set(families),issues=[];let refreshed=0;
 const queue=selected.filter(p=>wanted.has(p.sourceUrl.split('#')[0].replace(/\/$/,'')));
 // One enhanced request reads up to 200 complete families, not one paid request per SKU.
 const grouped=new Map();for(const p of queue){const key=p.sourceUrl.split('#')[0].replace(/\/$/,'');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(p);}
 const urls=[...grouped.keys()];for(let offset=0;offset<urls.length;){const size=reader.recommendedFamilyBatchSize?.()||100;const chosen=urls.slice(offset,offset+size);offset+=chosen.length;const batch=chosen.flatMap(url=>grouped.get(url));let preparationError;try{await reader.prepareFamilies(batch)}catch(e){preparationError=e;}
  for(const p of batch)try{if(preparationError&&!reader.familyReady?.(p.sourceUrl))continue;const response=await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown']});const d=parseDetails(response,p.sku,p.sourceUrl);applyDetails(p,d);p.sourceDescription=d.featuresText;p.dimensions=productDimensions(d.specs,d.featuresText);p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);p.material=materialFacts(d.specs,d.featuresText).label;const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;
   if(/\b(?:outdoor|garden|lawn|weatherproof)\b/i.test(p.variantName+' '+(d.specs['Indoor/Outdoor']||''))&&!p.departmentIds.includes('outdoor'))p.departmentIds.push('outdoor');delete p.detailError;refreshed++;
  }catch(e){issues.push({sku:p.sku,reason:String(e.message).slice(0,200),transient:Boolean(e.transient),deferred:Boolean(e.deferred)});p.detailError=String(e.message).slice(0,200);}
  await saveDecorationDetails(snapshot.products.filter(p=>p.detailsReady));console.log(JSON.stringify({phase:'decoration-SKU-details',verified:snapshot.products.filter(p=>p.detailsReady).length,total:snapshot.products.length,families:reader.familyCount?.()}));
  if(preparationError)throw preparationError;
 }
 return {verified:snapshot.products.filter(p=>p.detailsReady).length,total:snapshot.products.length,requested:queue.length,refreshed,issues};
}
export function sourceColours(p){
 const raw=p.sourceColour||p.specifications?.Colour||p.specifications?.Color||'',title=p.variantName||'',suffix=title.split(/\s[-–]\s/).slice(1).join(' - '),colourText=normaliseColors(suffix).length?suffix:title.split(/\b(?:with|holding|wearing)\b/i)[0],named=normaliseColors(colourText),specified=normaliseColors(raw);
 if(/\bclear|transparent\b/i.test(raw+' '+title))specified.push('透明色');if(/\bbronze\b/i.test(raw+' '+title))specified.push('古铜色');
 const reliable=specified.length&&!/multi|assorted|various|mixed/i.test(raw);
 return {raw,named,explicitTitleColours:Boolean(named.length&&(normaliseColors(suffix).length||/\band\b|[&/,]/i.test(colourText))&&!/\b(?:LED|lights?)\b/i.test(colourText)),specified:[...new Set(specified)],reliable:Boolean(reliable),conflict:Boolean(named.length&&reliable&&!named.every(c=>specified.includes(c)))};
}
export async function enrichDecorations(products,{infer=true}={}){
 const cache=await fs.readFile('web/decoration-visual-cache.json','utf8').then(JSON.parse).catch(()=>({version:1,entries:{}}));
 const manual=await fs.readFile('web/visual-overrides.json','utf8').then(JSON.parse).catch(()=>({products:{}}));
 const oldCache=await fs.readFile('web/visual-cache.json','utf8').then(JSON.parse).catch(()=>({entries:{}}));
 const pending=new Map(),sources=new Map();let inferred=0,description=0,reviewed=0;
 for(const p of products){
  if(p.specifications){p.material=materialFacts(p.specifications,p.sourceDescription||'').label;p.dimensions=productDimensions(p.specifications,p.sourceDescription||'');}
  const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;
  const source=sourceColours(p),hash=p.imageCacheEvidence?.sha256;sources.set(p.sku,source);
  const review=manual.products[p.sku];if(hash&&review?.imageHash===hash){cache.entries[hash]={...review,reviewed:true,method:'source-image-human-reviewed'};reviewed++;}
  if(hash&&!cache.entries[hash]){const known=oldCache.entries['tree:'+hash]||oldCache.entries['skirt:'+hash];if(known)cache.entries[hash]=known;}
  if(review?.imageHash===hash&&cache.entries[hash])p.colorValues=cache.entries[hash].colors;
  else if(source.reliable&&!source.conflict){p.colorValues=source.specified;description++;}
  else if(source.named.length&&!source.conflict&&(!/assorted|mixed|multi/i.test(source.raw)||source.explicitTitleColours)){p.colorValues=source.named;description++;}
  else if(hash&&p.cachedImageUrl&&infer){if(!cache.entries[hash])pending.set(hash,p);p.colorValues=cache.entries[hash]?.colors;}
  else p.colorValues=source.specified.length?source.specified:source.named;
 }
 const queue=[...pending].sort((a,b)=>(a[1].department||'').localeCompare(b[1].department||''));for(let offset=0;offset<queue.length;offset+=8){const batch=queue.slice(offset,offset+8),{analyseDecorationImages}=await import('./visual-model.mjs');const visuals=await analyseDecorationImages(batch.map(([,p])=>p),batch.map(([,p])=>'web/'+p.cachedImageUrl));for(let i=0;i<batch.length;i++)cache.entries[batch[i][0]]=visuals[i];inferred+=batch.length;if(offset%128===0){await atomicJson('web/decoration-visual-cache.json',cache);console.log(JSON.stringify({phase:'local-decoration-colours',analysed:inferred,total:queue.length,firecrawlCredits:0}));}}
 for(const p of products){const source=sources.get(p.sku),hash=p.imageCacheEvidence?.sha256,visual=hash&&cache.entries[hash];if(!p.colorValues?.length&&visual)p.colorValues=visual.colors;p.colorValues=[...new Set(p.colorValues||[])];p.treeColor=p.colorValues.join(' / ')||'颜色待核验';p.paletteEvidence={method:hash&&manual.products[p.sku]?.imageHash===hash?'source-image-human-reviewed':source.reliable&&!source.conflict?'SKU-colour-specification-and-description':source.named.length&&!source.conflict&&(!/assorted|mixed|multi/i.test(source.raw)||source.explicitTitleColours)?'SKU-title-and-description':visual?'local-image-model-and-description':'SKU-title-and-description',imageHash:hash,sourceColour:source.raw,bodyOnly:true,colors:p.colorValues,confidence:visual?.confidence||null,sourceConflict:source.conflict};}
 await atomicJson('web/decoration-visual-cache.json',cache);return {products:products.length,sourceDescription:description,locallyInferred:inferred,reviewed,firecrawlCredits:0};
}
export async function publishDecorations(snapshot){
 await loadDecorationDetails(snapshot.products);
 for(const p of snapshot.products){const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;}
 await saveDecorationDetails(snapshot.products);
 const products=snapshot.products.map(compactDecoration);snapshot.stats=Object.fromEntries(decorationDepartments.map(d=>[d.id,{count:products.filter(p=>p.departmentIds.includes(d.id)).length,newCount:products.filter(p=>p.departmentIds.includes(d.id)&&(p.newStatus||p.firstNewObservedAt)).length}]));
 snapshot.products=products;snapshot.revision=digest({at:snapshot.observedAt,products});await atomicJson('web/decorations.json',snapshot);
}
export async function publishDecorationStatus(snapshot,native={}){
 const verified=snapshot.products.filter(p=>p.detailsReady).length;
 await atomicJson('web/decorations-status.json',{state:snapshot.ready?'active':'needs-review',observedAt:snapshot.observedAt,revision:snapshot.revision,products:snapshot.products.length,verified,imageFailures:snapshot.browserImageAudit?.failed??null,native});
}

export function notificationSnapshot(trees,decorations){const map=new Map(trees.products.map(p=>[p.sku,p]));for(const p of decorations?.products||[]){const prior=map.get(p.sku);if(prior){prior.departmentIds=p.departmentIds;prior.department=p.department;}else map.set(p.sku,p);}return {...trees,observedAt:Date.parse(decorations?.observedAt)>Date.parse(trees.observedAt)?decorations.observedAt:trees.observedAt,products:[...map.values()]};}
