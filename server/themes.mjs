import fs from 'node:fs/promises';
import {collectPartitionedCategory} from './catalogue-partitions.mjs';
import {atomicJson,correctKnownProductPath} from './sync.mjs';
import {detailFingerprint,digest} from './collection-policy.mjs';
import {selectGalleryImages} from './enrich-appearance.mjs';
import {parseDetails,applyDetails,validProductImage} from './details.mjs';
import {materialFacts} from './appearance.mjs';
import {productDimensions,THEME_DEFINITIONS,sourcePrice} from '../web/catalogue-model.mjs';

// IDs and paths are taken from the official root page's data-category quickFilters.
export const THEME_SOURCES=THEME_DEFINITIONS.map(t=>({scope:t.id,id:t.categoryId,path:'christmas/christmas-themes/'+t.slug}));
export const emptyThemes=()=>({version:1,products:[],history:{},sources:{},baselineReady:false,observedAt:null});
export const readThemes=()=>fs.readFile('web/themes.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return emptyThemes()});
export const themeDetailUrl=p=>'theme-details/'+p.sku.slice(-2).padStart(2,'0')+'.json';
const evidenceFields=['detailsReady','detailEvidence','attributeObservedAt','specifications','sourceDescription','dimensions','material','colorValues','treeColor','sourceColour','sourceMaterial','appearanceSource','images','originalImages','originalImageUrl','variantImageUrl','cachedImageUrl','imageCacheEvidence','imageSelectionEvidence','detailIssue','productSummary','originalSourceEvidence'];
function memberships(p){return ['themes',...THEME_DEFINITIONS.map(d=>d.id).filter(id=>(p.themeIds||[]).includes(id))];}
export function borrowThemeEvidence(snapshot,sources=[]){
 const records=new Map(sources.flatMap(s=>s?.products||[]).map(p=>[p.sku,p]));let reused=0;
 for(const p of snapshot.products){const q=records.get(p.sku);if(!q||q.sourceUrl?.split('#')[0]!==p.sourceUrl.split('#')[0]||q.variantName!==p.variantName||(q.listingVariantImageUrl||q.variantImageUrl)!==p.listingVariantImageUrl)continue;
  const verified=q.detailEvidence?.verifiedProductSection&&String(q.detailEvidence.selectedSku)===p.sku;
  if((!p.detailsReady||!p.detailEvidence?.verifiedProductSection)&&verified){for(const key of evidenceFields)if(q[key]!==undefined)p[key]=structuredClone(q[key]);p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);reused++;}
  if(!p.cachedImageUrl&&q.imageCacheEvidence?.sourceUrl===p.variantImageUrl){p.cachedImageUrl=q.cachedImageUrl;p.imageCacheEvidence=q.imageCacheEvidence;}
 }
 return reused;
}
export function mergeThemes(previous,collected,observedAt=new Date().toISOString(),shared=[]){
 const rows=new Map(),sets=new Map(),sources={},old=new Map(previous.products.map(p=>[p.sku,p])),known=new Map(shared.flatMap(s=>s?.products||[]).map(p=>[p.sku,p])),history={...previous.history};
 for(const source of THEME_SOURCES){const listing=collected[source.scope];if(!listing?.audit?.complete||listing.products.length!==listing.audit.expected)throw Error('Incomplete official theme category: '+source.scope);
  sources[source.scope]={...listing.audit,url:'https://www.therange.co.uk/'+source.path};
  for(const row of listing.products){const sku=String(row.sku),q=rows.get(sku);if(q&&['price','originalPrice','newIn','variantImageUrl'].some(k=>q[k]!==row[k]))throw Error('Theme SKU changed across official categories: '+sku);rows.set(sku,row);if(!sets.has(sku))sets.set(sku,new Set(['themes']));sets.get(sku).add(source.scope);}
 }
 const products=[...rows].map(([sku,row])=>{
  const prior=old.get(sku),sharedPrior=known.get(sku),h={...(history[sku]||{})};
  if(!h.firstObservedAt){h.firstObservedAt=sharedPrior?.firstObservedAt||observedAt;h.firstNewObservedAt=sharedPrior?.firstNewObservedAt||null;h.everNew=Boolean(sharedPrior?.everNew||sharedPrior?.newStatus);h.arrivalEvidence=sharedPrior?.arrivalEvidence||'initial-baseline';}
  if(row.newIn&&!h.everNew){h.firstNewObservedAt=previous.baselineReady||sharedPrior?observedAt:null;h.arrivalEvidence=previous.baselineReady||sharedPrior?'observed-after-baseline':'initial-baseline';}h.everNew=Boolean(h.everNew||row.newIn);history[sku]=h;
  const p={...prior,...row,sku,kind:sharedPrior?.kind||prior?.kind||'decoration',department:sharedPrior?.department||prior?.department||'themes',departmentIds:[...sets.get(sku)],themeIds:[...sets.get(sku)],priceGBP:row.price/100,originalPrice:Number.isInteger(row.originalPrice)?row.originalPrice:null,promoText:row.promoText||null,currency:'GBP',newStatus:row.newIn,observedAt,newEvidence:{kind:'website_flag',field:'newIn',value:row.newIn,observedAt},...h};
  const u=new URL('https://www.therange.co.uk/'+row.variantPath.replace('#','/#'));u.pathname=correctKnownProductPath(u.pathname);p.sourceUrl=u.href;p.listingVariantImageUrl=row.variantImageUrl||row.imageUrl;
  const fp=detailFingerprint(p);if(prior?.detailInputFingerprint!==fp){for(const k of evidenceFields)delete p[k];p.variantImageUrl=row.variantImageUrl;p.detailsReady=false;}p.detailInputFingerprint=fp;
  if(prior?.listingVariantImageUrl!==p.listingVariantImageUrl){delete p.cachedImageUrl;delete p.imageCacheEvidence;}
  return p;
 });
 const snapshot={...previous,version:1,products,history,sources,observedAt,source:{id:'94583',expected:products.length,observed:products.length,unique:products.length,complete:true,rootCount:products.length,childOnlySkus:products.filter(p=>!true).map(p=>p.sku)},ready:false};
 borrowThemeEvidence(snapshot,[...shared,previous]);return snapshot;
}
export async function collectThemeDirectory(reader,previous,shared=[]){
 const collected={};for(const source of THEME_SOURCES){collected[source.scope]=await collectPartitionedCategory(source.id,reader);console.log(JSON.stringify({phase:'theme-directory',scope:source.scope,products:collected[source.scope].products.length}));}
 return mergeThemes(previous,collected,new Date().toISOString(),shared);
}
export function inheritThemeArrivals(snapshot,shared=[]){
 const known=new Map(shared.flatMap(s=>s?.products||[]).map(p=>[p.sku,p]));
 for(const p of snapshot.products){const q=known.get(p.sku);if(!q?.firstNewObservedAt||q.arrivalEvidence==='initial-baseline')continue;for(const k of ['firstObservedAt','firstNewObservedAt','arrivalEvidence','everNew'])if(q[k]!=null)p[k]=q[k];snapshot.history[p.sku]={...snapshot.history[p.sku],firstObservedAt:p.firstObservedAt,firstNewObservedAt:p.firstNewObservedAt,arrivalEvidence:p.arrivalEvidence,everNew:p.everNew};}
}
export async function loadThemeDetails(products){
 const buckets=new Map();for(const p of products){const key=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(key))buckets.set(key,await fs.readFile('web/theme-details/'+key+'.json','utf8').then(JSON.parse).catch(()=>({})));const q=buckets.get(key)[p.sku];if(q?.detailInputFingerprint===p.detailInputFingerprint&&q.detailsReady&&(!p.detailsReady||!p.detailEvidence?.verifiedProductSection||Date.parse(q.attributeObservedAt)>Date.parse(p.attributeObservedAt))){for(const k of evidenceFields)if(q[k]!==undefined)p[k]=q[k];}}
}
async function saveThemeDetails(products){const groups=new Map();for(const p of products){const key=p.sku.slice(-2).padStart(2,'0');if(!groups.has(key))groups.set(key,{});groups.get(key)[p.sku]=p;}for(const [k,v]of groups)await atomicJson('web/theme-details/'+k+'.json',v);}
export async function updateThemeDetails(snapshot,reader,{shared=[],refreshAfter=null,retryFailed=false,selectedSkus=null}={}){
 await loadThemeDetails(snapshot.products);const reused=borrowThemeEvidence(snapshot,shared),selected=snapshot.products.filter(p=>selectedSkus?selectedSkus.includes(p.sku):!p.detailsReady&&(retryFailed||!(Date.parse(p.detailIssue?.retryAfter)>Date.now()))||refreshAfter&&Date.parse(p.attributeObservedAt)<Date.parse(refreshAfter));
 const grouped=new Map();for(const p of selected){const url=p.sourceUrl.split('#')[0].replace(/\/$/,'');if(!grouped.has(url))grouped.set(url,[]);grouped.get(url).push(p);}const urls=[...grouped.keys()];let refreshed=0;const issues=[];
 for(let offset=0;offset<urls.length;){const chosen=urls.slice(offset,offset+(reader.recommendedFamilyBatchSize?.()||100));offset+=chosen.length;let failure;try{await reader.prepareFamilies(chosen.flatMap(url=>grouped.get(url)))}catch(e){failure=e;}
  for(const url of chosen)for(const p of grouped.get(url))try{if(failure&&!reader.familyReady?.(p.sourceUrl))continue;const d=parseDetails(await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown']}),p.sku,p.sourceUrl);applyDetails(p,d);p.sourceDescription=d.featuresText;p.detailInputFingerprint=detailFingerprint(p);p.detailsReady=true;delete p.detailIssue;refreshed++;}catch(e){const unavailable=e.sourceResponse?.htmlStatus===404&&[404,500].includes(e.sourceResponse?.jsonStatus),issue={sku:p.sku,status:e.status||0,reason:String(e.message).slice(0,200),transient:!unavailable&&Boolean(e.transient),deferred:Boolean(e.deferred),sourceUnavailable:unavailable,jsonStatus:e.sourceResponse?.jsonStatus,htmlStatus:e.sourceResponse?.htmlStatus,observedAt:new Date().toISOString(),retryAfter:new Date(Date.now()+(unavailable?7:1)*86400000).toISOString()};p.detailIssue=issue;issues.push(issue);}
  await saveThemeDetails(snapshot.products);console.log(JSON.stringify({phase:'theme-SKU-details',verified:snapshot.products.filter(p=>p.detailsReady).length,total:snapshot.products.length}));if(failure)throw failure;
 }
 await selectGalleryImages(snapshot.products);return {requested:selected.length,refreshed,reused,issues};
}
export async function recoverThemeImages(products,reader){
 const issues=[];let recovered=0;
 for(const p of products.filter(p=>p.detailsReady&&!validProductImage(p.variantImageUrl))){
  try{await reader.captureVerified(p.sourceUrl);const originals=reader.originalsFor(p.sourceUrl).filter(g=>g.selectedSku===p.sku&&validProductImage(g.url));if(!originals.length)throw Error('No verified selected-SKU original');const image=originals[0];p.variantImageUrl=image.url;p.originalImageUrl=image.url;p.originalImages=originals;p.images=[...new Set([image.url,...p.images||[]])];p.imageSelectionEvidence={method:'visible-selected-SKU-original',sourceUrl:p.sourceUrl,selectedSku:p.sku,observedAt:new Date().toISOString()};delete p.cachedImageUrl;delete p.imageCacheEvidence;recovered++;}
  catch(e){issues.push({sku:p.sku,error:e.message});}
 }
 return {recovered,issues};
}
export function enrichThemes(products){
 for(const p of products){if(p.specifications){p.dimensions=productDimensions(p.specifications,p.sourceDescription||'');p.material=materialFacts(p.specifications,p.sourceDescription||'').label;}p.departmentIds=[...new Set([...(p.departmentIds||[]),...memberships(p)])];p.priceEvidence={source:'official-catalogue-price-and-originalPrice',observedAt:p.observedAt,originalPricePence:p.originalPrice,...sourcePrice(p)};}
 return {products:products.length,imageAnalysis:false,firecrawlCredits:0};
}
export async function publishThemes(snapshot,native=null){
 if(native===null)native=await fs.readFile('web/themes-status.json','utf8').then(JSON.parse).then(s=>s.native||{}).catch(()=>({}));
 await loadThemeDetails(snapshot.products);enrichThemes(snapshot.products);await saveThemeDetails(snapshot.products);
 const failedImages=new Map((snapshot.browserImageAudit?.failures||[]).map(r=>[r.url,r]));
 for(const p of snapshot.products){if(p.cachedImageUrl&&p.imageCacheEvidence?.sha256){delete p.imageIssue;continue;}const failure=failedImages.get(p.variantImageUrl||p.imageUrl);if(failure)p.imageIssue={sourceUrl:failure.url,status:failure.status||0,reason:failure.error,observedAt:failure.observedAt||snapshot.browserImageAudit.observedAt,confirmedUnavailable:[403,404].includes(failure.status)};}
 const keys=['sku','kind','department','departmentIds','themeIds','variantName','name','brand','priceGBP','originalPrice','promoText','priceEvidence','currency','sourceUrl','rawSourceUrl','productPath','productCode','variantPath','variantId','listingVariantImageUrl','variantImageUrl','imageUrl','cachedImageUrl','imageCacheEvidence','imageIssue','newStatus','newEvidence','firstObservedAt','firstNewObservedAt','arrivalEvidence','everNew','observedAt','attributeObservedAt','detailInputFingerprint','detailsReady','detailIssue','dimensions','material','sourceColour','treeColor','colorValues','originalImageUrl','originalSourceEvidence','productSummary','mailAssets'];
 snapshot.products=snapshot.products.map(p=>({...Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),detailsUrl:themeDetailUrl(p)}));
 const verified=snapshot.products.filter(p=>p.detailsReady).length,missingImages=snapshot.products.filter(p=>!p.cachedImageUrl||!p.imageCacheEvidence?.sha256).length,pending=snapshot.products.filter(p=>!p.detailsReady&&(!p.detailIssue||p.detailIssue.transient||p.detailIssue.deferred)).length;
 const unavailableImages=snapshot.products.filter(p=>(!p.cachedImageUrl||!p.imageCacheEvidence?.sha256)&&p.imageIssue?.confirmedUnavailable&&p.imageIssue.sourceUrl===(p.variantImageUrl||p.imageUrl)).length;
 snapshot.coverage={total:snapshot.products.length,verified,sourcePageErrors:snapshot.products.length-verified,pending,missingImages,unavailableImages,pendingImages:missingImages-unavailableImages};snapshot.operationalReady=Boolean(snapshot.source?.complete&&missingImages===unavailableImages&&pending===0);snapshot.ready=snapshot.operationalReady&&missingImages===0&&verified===snapshot.products.length;snapshot.revision=digest({at:snapshot.observedAt,products:snapshot.products});
 await atomicJson('web/themes.json',snapshot);await atomicJson('web/themes-status.json',{state:snapshot.ready?'active':snapshot.operationalReady?'active-with-source-issues':'needs-review',observedAt:snapshot.observedAt,products:snapshot.products.length,sources:snapshot.sources,coverage:snapshot.coverage,revision:snapshot.revision,native});return snapshot;
}
