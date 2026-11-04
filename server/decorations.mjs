import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {classifyDecoration,productDimensions,decorationDepartments,decorationMemberships} from '../web/catalogue-model.mjs';
import {normaliseColors,materialFacts} from './appearance.mjs';
import {detailFingerprint,digest} from './collection-policy.mjs';
import {atomicJson,collectStableCategory} from './sync.mjs';
import {parseDetails,applyDetails,validProductImage} from './details.mjs';
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
  p.originalPrice=Number.isInteger(row.originalPrice)?row.originalPrice:null;p.promoText=row.promoText||null;
  p.listingVariantImageUrl=row.variantImageUrl||row.imageUrl;
  const fingerprint=detailFingerprint(p);if(prior?.detailInputFingerprint!==fingerprint){p.detailsReady=false;delete p.detailIssue;delete p.detailEvidence;delete p.specifications;delete p.sourceDescription;p.colorValues=[];p.treeColor='颜色待核验';p.dimensions=productDimensions();p.material='材质未注明 · Material not specified';}
  if((prior?.listingVariantImageUrl||prior?.variantImageUrl)!==p.listingVariantImageUrl){delete p.cachedImageUrl;delete p.imageCacheEvidence;delete p.paletteEvidence;}
  p.detailsReady=Boolean(p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===p.sku&&p.attributeObservedAt);p.detailInputFingerprint=fingerprint;const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;return p;
 });
 return {...previous,version:1,products,history,observedAt,source:{...DECORATION_SOURCE,...listing.audit},ready:false,revision:digest({at:observedAt,products:products.map(p=>[p.sku,p.priceGBP,p.newStatus,p.listingVariantImageUrl])})};
}
export async function loadDecorationDetails(products){
 const buckets=new Map();for(const p of products){const bucket=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(bucket))buckets.set(bucket,await fs.readFile('web/decoration-details/'+bucket+'.json','utf8').then(JSON.parse).catch(()=>({})));const saved=buckets.get(bucket)[p.sku];if(saved?.detailsReady===true&&saved.detailEvidence?.verifiedProductSection&&String(saved.detailEvidence.selectedSku)===p.sku&&saved.detailInputFingerprint===p.detailInputFingerprint&&!(p.detailEvidence?.verifiedProductSection&&Date.parse(p.attributeObservedAt)>=Date.parse(saved.attributeObservedAt))){for(const key of ['detailsReady','detailEvidence','attributeObservedAt','specifications','sourceDescription','dimensions','material','colorValues','treeColor','paletteEvidence','sourceColour','sourceMaterial','appearanceSource','images','originalImages','originalImageUrl','originalSourceEvidence','department','departmentIds','classificationEvidence','variantImageUrl','cachedImageUrl','imageCacheEvidence','imageSelectionEvidence','sourceListingImageUrl'])if(saved[key]!==undefined)p[key]=saved[key];p.detailsReady=true;}}
 for(const p of products)if(!validProductImage(p.variantImageUrl)&&validProductImage(p.listingVariantImageUrl)){p.variantImageUrl=p.listingVariantImageUrl;if(p.imageCacheEvidence?.sourceUrl!==p.variantImageUrl){delete p.cachedImageUrl;delete p.imageCacheEvidence;}}
 return buckets;
}
export async function saveDecorationDetails(products){
 const buckets=new Map();for(const p of products){const bucket=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(bucket))buckets.set(bucket,{});buckets.get(bucket)[p.sku]=p;}
 for(const [bucket,rows]of buckets)await atomicJson('web/decoration-details/'+bucket+'.json',rows);
}
export const detailUrl=p=>'decoration-details/'+p.sku.slice(-2).padStart(2,'0')+'.json';
export function compactDecoration(p){
 const keys=['sku','kind','department','departmentIds','taxonomyAudit','displayImage','specificationCorrections','variantName','name','brand','priceGBP','originalPrice','promoText','currency','sourceUrl','listingVariantImageUrl','variantImageUrl','imageUrl','cachedImageUrl','imageCacheEvidence','newStatus','newEvidence','firstObservedAt','firstNewObservedAt','arrivalEvidence','everNew','observedAt','attributeObservedAt','detailInputFingerprint','detailsReady','detailIssue','dimensions','material','colorValues','treeColor','paletteEvidence','classificationEvidence','originalImageUrl','originalImageEvidence','originalSourceEvidence','mailAssets'];
 const out=Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));out.detailsReady=Boolean(p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===p.sku&&p.attributeObservedAt);out.detailsUrl=detailUrl(p);return out;
}
export async function updateDecorationDetails(snapshot,reader,{maxFamilies=Infinity,refreshAll=false,refreshAfter=null}={}){
 await loadDecorationDetails(snapshot.products);
 const selected=snapshot.products.filter(p=>refreshAll||!p.detailsReady&&!(Date.parse(p.detailIssue?.retryAfter)>Date.now())||refreshAfter&&p.detailsReady&&Date.parse(p.attributeObservedAt)<Date.parse(refreshAfter)),families=[...new Set(selected.map(p=>p.sourceUrl.split('#')[0].replace(/\/$/,'')))].slice(0,maxFamilies),wanted=new Set(families),issues=[];let refreshed=0;
 const queue=selected.filter(p=>wanted.has(p.sourceUrl.split('#')[0].replace(/\/$/,'')));
 // One enhanced request reads up to 200 complete families, not one paid request per SKU.
 const grouped=new Map();for(const p of queue){const key=p.sourceUrl.split('#')[0].replace(/\/$/,'');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(p);}
 const urls=[...grouped.keys()];for(let offset=0;offset<urls.length;){const size=reader.recommendedFamilyBatchSize?.()||100;const chosen=urls.slice(offset,offset+size);offset+=chosen.length;const batch=chosen.flatMap(url=>grouped.get(url));let preparationError;try{await reader.prepareFamilies(batch)}catch(e){preparationError=e;}
  for(const p of batch)try{if(preparationError&&!reader.familyReady?.(p.sourceUrl))continue;const response=await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown']});const d=parseDetails(response,p.sku,p.sourceUrl);applyDetails(p,d);p.sourceDescription=d.featuresText;p.dimensions=productDimensions(d.specs,d.featuresText);p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);p.material=materialFacts(d.specs,d.featuresText).label;const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;
   if(/\b(?:outdoor|garden|lawn|weatherproof)\b/i.test(p.variantName+' '+(d.specs['Indoor/Outdoor']||''))&&!p.departmentIds.includes('outdoor'))p.departmentIds.push('outdoor');delete p.detailError;delete p.detailIssue;refreshed++;
  }catch(e){const at=new Date().toISOString(),unavailable=e.sourceResponse?.jsonStatus===404&&e.sourceResponse?.htmlStatus===404,issue={sku:p.sku,reason:String(e.message).slice(0,200),status:e.status||0,transient:Boolean(e.transient),deferred:Boolean(e.deferred),sourceResponse:e.sourceResponse,sourceUnavailable:unavailable,observedAt:at};issues.push(issue);p.detailError=issue.reason;p.detailIssue={...issue,retryAfter:!e.transient&&!e.deferred&&[403,404].includes(e.status)?new Date(Date.now()+(unavailable?7:1)*86400000).toISOString():null};}
  await saveDecorationDetails(snapshot.products);console.log(JSON.stringify({phase:'decoration-SKU-details',verified:snapshot.products.filter(p=>p.detailsReady).length,total:snapshot.products.length,families:reader.familyCount?.()}));
  if(preparationError)throw preparationError;
 }
 return {verified:snapshot.products.filter(p=>p.detailsReady).length,total:snapshot.products.length,requested:queue.length,refreshed,issues};
}
export function sourceColours(p){
 const raw=p.sourceColour||p.specifications?.Colour||p.specifications?.Color||'',title=p.variantName||'',suffix=title.split(/\s[-–]\s/).slice(1).join(' - '),colourText=normaliseColors(suffix).length?suffix:title.split(/\b(?:with|holding|wearing)\b/i)[0],named=normaliseColors(colourText),specified=normaliseColors(raw);
 if(/\bclear|transparent\b/i.test(raw+' '+title))specified.push('透明色');if(/\bbronze\b/i.test(raw+' '+title))specified.push('古铜色');
 const lampOnly=['wreath','garland','swag','spray'].includes(p.department)&&/\b(?:warm white|cool white|bright white|RGB)\b/i.test(raw);if(lampOnly)specified.length=0;
 const reliable=specified.length&&!/multi|assorted|various|mixed/i.test(raw);
 const word='(?:dark |light )?(?:red|green|white|ivory|cream|black|grey|gray|pink|rose gold|gold|golden|silver|blue|navy|brown|beige|purple|orange|yellow|teal|copper|bronze|clear|transparent)',sequence=word+'(?:\\s*(?:and|&|/|,|or|\\+)\\s*'+word+'){0,3}',pattern=new RegExp('\\b(finished in|colou?red|colou?rs?\\s*:|(?:available|offered|supplied|comes) in)\\s+(?:a\\s+)?('+sequence+')','ig'),described=[];
 const description=p.sourceDescription||p.appearanceSource?.descriptionText||'';
 for(const m of description.matchAll(pattern)){if(/^(?:available|offered|supplied|comes)/i.test(m[1])&&reliable)continue;if(/^\s*(?:LEDs?|lights?|bulbs?|lighting)\b/i.test(description.slice(m.index+m[0].length)))continue;described.push(...normaliseColors(m[2]));}
 return {raw,named,described:[...new Set(described)],explicitTitleColours:Boolean(named.length&&(normaliseColors(suffix).length||/\band\b|[&/,]/i.test(colourText))&&!/\b(?:LED|lights?)\b/i.test(colourText)),specified:[...new Set(specified)],reliable:Boolean(reliable),conflict:Boolean(named.length&&reliable&&!named.every(c=>specified.includes(c)))};
}
export const decorationVisualKey=(p,hash)=>((/tree (?:skirt|collar)|tree stand cover/i.test(p.variantName||'')?'tree-skirt':/artificial christmas tree/i.test(p.variantName||'')?'tree':p.department)||'ornaments')+':'+hash;
export async function enrichDecorations(products,{infer=true}={}){
 const cache=await fs.readFile('web/decoration-visual-cache.json','utf8').then(JSON.parse).catch(()=>({version:1,entries:{}}));
 const manual=await fs.readFile('web/visual-overrides.json','utf8').then(JSON.parse).catch(()=>({products:{}}));
 const decorationManual=await fs.readFile('web/decoration-visual-overrides.json','utf8').then(JSON.parse).catch(()=>({products:{}}));manual.products={...manual.products,...decorationManual.products};
 const oldCache=await fs.readFile('web/visual-cache.json','utf8').then(JSON.parse).catch(()=>({entries:{}}));
 const existing=await fs.readFile('web/catalogue.json','utf8').then(JSON.parse).then(d=>new Map(d.products.map(p=>[p.sku,p]))).catch(()=>new Map());
 const pending=new Map(),sources=new Map();let inferred=0,description=0,reviewed=0;
 for(const p of products){
  if(p.specifications){p.material=materialFacts(p.specifications,p.sourceDescription||'').label;p.dimensions=productDimensions(p.specifications,p.sourceDescription||'');}
  const priorHash=p.imageCacheEvidence?.sha256,priorKey=decorationVisualKey(p,priorHash),priorVisual=cache.entries[priorKey];
  const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;
  const source=sourceColours(p),hash=p.imageCacheEvidence?.sha256,key=decorationVisualKey(p,hash);sources.set(p.sku,source);
  if(hash&&key!==priorKey&&!cache.entries[key]){const known=priorVisual||p.paletteEvidence?.imageHash===hash&&p.paletteEvidence?.bodyOnly&&p.colorValues?.length&&{colors:p.colorValues,confidence:p.paletteEvidence.confidence,method:p.paletteEvidence.method};if(known)cache.entries[key]={...known,classificationReusedFrom:priorKey};}
  const review=manual.products[p.sku];if(hash&&review?.imageHash===hash){cache.entries[key]={...review,reviewed:true,method:'source-image-human-reviewed'};reviewed++;}
  if(hash&&!cache.entries[key]){const old=existing.get(p.sku),known=old?.imageCacheEvidence?.sha256===hash&&oldCache.entries[old.kind+':'+hash];if(known)cache.entries[key]=known;}
  if(hash&&p.cachedImageUrl&&infer&&!cache.entries[key])pending.set(key,p);
  if(review?.imageHash===hash&&cache.entries[key])p.colorValues=cache.entries[key].colors;
  else if(source.described.length){p.colorValues=source.described;description++;}
  else if(source.reliable&&!source.conflict){p.colorValues=source.specified;description++;}
  else if(source.named.length&&!source.conflict&&(!/assorted|mixed|multi/i.test(source.raw)||source.explicitTitleColours)){p.colorValues=source.named;description++;}
  else if(hash&&p.cachedImageUrl&&infer){if(!cache.entries[key])pending.set(key,p);p.colorValues=cache.entries[key]?.colors;}
  else p.colorValues=source.specified.length?source.specified:source.named;
 }
 const queue=[...pending].sort((a,b)=>(a[1].department||'').localeCompare(b[1].department||''));for(let offset=0;offset<queue.length;offset+=8){const batch=queue.slice(offset,offset+8),{analyseDecorationImages}=await import('./visual-model.mjs');const visuals=await analyseDecorationImages(batch.map(([,p])=>p),batch.map(([,p])=>'web/'+p.cachedImageUrl));for(let i=0;i<batch.length;i++)cache.entries[batch[i][0]]=visuals[i];inferred+=batch.length;if(offset%128===0){await atomicJson('web/decoration-visual-cache.json',cache);console.log(JSON.stringify({phase:'local-decoration-colours',analysed:inferred,total:queue.length,firecrawlCredits:0}));}}
 for(const p of products){const source=sources.get(p.sku),hash=p.imageCacheEvidence?.sha256,key=decorationVisualKey(p,hash),visual=hash&&cache.entries[key];if(!p.colorValues?.length&&visual)p.colorValues=visual.colors;if(visual&&!source.described.length&&source.reliable&&!source.conflict&&!source.named.length&&!source.specified.includes('透明色')&&visual.confidence>=.55&&!source.specified.every(c=>visual.colors.includes(c))){p.colorValues=visual.colors;source.conflict=true;}p.colorValues=[...new Set(p.colorValues||[])];p.treeColor=p.colorValues.join(' / ')||'颜色待核验';p.paletteEvidence={method:hash&&manual.products[p.sku]?.imageHash===hash?'source-image-human-reviewed':source.described.length?'SKU-explicit-colour-description':source.reliable&&!source.conflict?'SKU-colour-specification-and-description':source.named.length&&!source.conflict&&(!/assorted|mixed|multi/i.test(source.raw)||source.explicitTitleColours)?'SKU-title-and-description':visual?'local-image-model-and-description':'SKU-title-and-description',imageHash:hash,sourceColour:source.raw,bodyOnly:true,colors:p.colorValues,confidence:visual?.confidence||null,sourceConflict:source.conflict};}
 await atomicJson('web/decoration-visual-cache.json',cache);return {products:products.length,sourceDescription:description,locallyInferred:inferred,reviewed,firecrawlCredits:0};
}
export async function publishDecorations(snapshot){
 await loadDecorationDetails(snapshot.products);
 for(const p of snapshot.products){p.images=(p.images||[]).filter(validProductImage);const cls=classifyDecoration(p);p.department=cls.id;p.departmentIds=decorationMemberships(p,cls.id);p.classificationEvidence=cls;}
 await saveDecorationDetails(snapshot.products);
 const products=snapshot.products.map(compactDecoration);snapshot.stats=Object.fromEntries(decorationDepartments.map(d=>[d.id,{count:products.filter(p=>p.departmentIds.includes(d.id)).length,newCount:products.filter(p=>p.departmentIds.includes(d.id)&&(p.newStatus||p.firstNewObservedAt)).length}]));
 snapshot.products=products;snapshot.revision=digest({at:snapshot.observedAt,products});await atomicJson('web/decorations.json',snapshot);
}
export async function publishDecorationStatus(snapshot,native={}){
 const verified=snapshot.products.filter(p=>p.detailsReady).length;
 await atomicJson('web/decorations-status.json',{state:snapshot.ready?'active':snapshot.operationalReady?'active-with-source-issues':'needs-review',observedAt:snapshot.observedAt,revision:snapshot.revision,products:snapshot.products.length,verified,coverage:snapshot.coverage,imageFailures:snapshot.browserImageAudit?.failed??null,native});
}
export function decorationReadiness(snapshot){
 const ps=snapshot.products,verified=ps.filter(p=>p.detailsReady).length,unavailable=ps.filter(p=>!p.detailsReady&&p.detailIssue?.sourceUnavailable).length,blocked=ps.filter(p=>!p.detailsReady&&p.detailIssue?.status===403).length;
 snapshot.coverage={total:ps.length,verified,sourcePageUnavailable:unavailable,sourceBlocked:blocked,pending:ps.length-verified-unavailable-blocked};
 snapshot.collectionReady=Boolean(snapshot.source?.complete&&snapshot.source.expected===ps.length&&snapshot.browserImageAudit?.failed===0&&ps.every(p=>p.cachedImageUrl&&p.imageCacheEvidence?.sha256));
 snapshot.sourceReady=snapshot.collectionReady&&verified===ps.length;snapshot.ready=snapshot.sourceReady&&snapshot.appearanceReady===true;snapshot.operationalReady=snapshot.collectionReady&&snapshot.appearanceReady===true;return snapshot.coverage;
}
export async function restoreDecorationImageEvidence(snapshot){
 const checkpoint=await fs.readFile('web/decoration-image-checkpoint.json','utf8').then(JSON.parse).catch(()=>({entries:{}})),daily=await fs.readFile('web/daily-image-checkpoint.json','utf8').then(JSON.parse).catch(()=>({entries:{}})),prior={...checkpoint.entries,...daily.entries,...snapshot.browserImageAudit?.entries},valid=new Map();
 for(const p of snapshot.products){const url=p.variantImageUrl||p.imageUrl;if(!valid.has(url)){const e=prior[url];let ok=false;if(e?.ok&&e.width>=64&&e.height>=64&&/^images\/source\/[a-f0-9]{64}\.(jpg|png|webp|gif|avif)$/.test(e.cachedImageUrl||''))try{ok=createHash('sha256').update(await fs.readFile('web/'+e.cachedImageUrl)).digest('hex')===e.hash}catch{}valid.set(url,ok?e:null);}const e=valid.get(url);if(e){p.cachedImageUrl=e.cachedImageUrl;p.imageCacheEvidence={sourceUrl:url,sha256:e.hash,observedAt:e.observedAt};}else {delete p.cachedImageUrl;delete p.imageCacheEvidence;}}
 const entries=Object.fromEntries([...valid].filter(([,e])=>e)),failed=[...valid].filter(([,e])=>!e).length;
 snapshot.browserImageAudit={...snapshot.browserImageAudit,mode:'verified-saved-source-image-evidence',entries,checked:valid.size,loaded:valid.size-failed,failed,currentMissingImages:failed};return snapshot.browserImageAudit;
}

export function notificationSnapshot(trees,...catalogues){const map=new Map(trees.products.map(p=>[p.sku,p]));let observedAt=trees.observedAt;for(const c of catalogues){if(Date.parse(c?.observedAt)>Date.parse(observedAt))observedAt=c.observedAt;for(const p of c?.products||[]){const prior=map.get(p.sku);if(prior){prior.departmentIds=[...new Set([...(prior.departmentIds||[]),...(p.departmentIds||[])])];prior.department||=p.department;}else map.set(p.sku,p);}}return {...trees,observedAt,products:[...map.values()]};}
