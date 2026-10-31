import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {detailFingerprint} from './collection-policy.mjs';

export const categories={'artificial-trees':'94637','prelit-christmas-trees':'94634','snowy-christmas-trees':'94636','slim-christmas-trees':'2645178','pop-up-trees':'2645121','potted-christmas-trees':'2645136','christmas-tree-skirt':'410728'};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stamp=()=>new Date().toISOString();
export class SourceError extends Error{constructor(message,status=0,retryAfter=0){super(message);this.status=status;this.retryAfter=retryAfter;}}
export function parseSource(result){
 if(!result?.success||!result.data?.rawHtml)throw new SourceError('Data provider did not return raw source data');
 if(result.data.metadata?.statusCode!==200)throw new SourceError('Source returned non-200 status',result.data.metadata?.statusCode);
 let body=result.data.rawHtml;let d;try{d=JSON.parse(body)}catch{throw new SourceError('Source is not a JSON catalogue');}
 if(!Array.isArray(d.products)||!Number.isInteger(d.totalResults)||d.products.some(p=>typeof p.newIn!=='boolean'||p.inStock!==true||p.sponsored!==false||!/^\d{1,12}$/.test(String(p.sku))||!Number.isInteger(p.price)))throw new SourceError('Source catalogue has invalid product fields');
 return d;
}
export function apiUrl(categoryId,offset=0,filters={in_stock_f:['true']},facets=false){const u=new URL('https://search-lon.therange.co.uk/api/productlist');for(const [k,v] of Object.entries({categoryId,offset,limit:120,sort:'relevance',filters:JSON.stringify(filters),facets,includePriceFacet:facets}))u.searchParams.set(k,String(v));return u.href;}
export function createReader(){throw Error('逐页Firecrawl抓取已禁用；请使用按时计费的Firecrawl浏览器会话。')}
export async function collectCategory(id,reader){
 let expected;const products=[],batches=[];
 for(let offset=0;expected===undefined||offset<expected;offset+=120){
  const url=apiUrl(id,offset),d=await reader(url);if(expected===undefined)expected=d.totalResults;
  if(d.totalResults!==expected)throw new SourceError('Category count changed while paginating; snapshot not committed');
  products.push(...d.products);batches.push({url,offset,count:d.products.length,total:d.totalResults,observedAt:stamp()});
  if(!d.products.length&&offset<expected)throw new SourceError('Empty page before declared category total');
 }
 const unique=new Set(products.map(p=>String(p.sku))).size;
 if(products.length!==expected||unique!==expected)throw new SourceError('Category totals/records/unique SKUs do not reconcile');
 return {products,audit:{expected,observed:products.length,unique,complete:true,records:products.map(p=>String(p.sku)),batches}};
}
export async function collectStableCategory(id,reader){let error;for(let attempt=0;attempt<3;attempt++){try{return await collectCategory(id,reader)}catch(e){error=e;if(e.status||!/^Category|^Empty page/.test(e.message))throw e;}}throw error;}
const negative=/pot grown|keeleco|lorry with christmas tree|crochet a christmas tree|10yds natural hessian|olive tree|inflatable christmas santa|christmas street lamp|boxwood topiary/i;
export function mergeSnapshot(previous,collected,now=stamp()){
 const old=new Map(previous.products.map(p=>[String(p.sku),p])),oldExcluded=new Map((previous.excluded||[]).map(p=>[String(p.sku),p]));
 const map=new Map,sources={},conflicts=[];
 for(const [category,{products,audit}] of Object.entries(collected)){
  sources[category]=audit;
  for(const product of products){const sku=String(product.sku),prior=map.get(sku);if(prior){if(['price','newIn','inStock','variantId','variantImageUrl','variantName'].some(k=>prior[k]!==product[k]))conflicts.push({sku,category,reason:'Live values differ between source categories'});prior.categories.push(category);}else map.set(sku,{...product,sku,categories:[category]});}
 }
 if(Object.keys(sources).length!==7||conflicts.length)throw new SourceError('Incomplete categories or inconsistent cross-category source values');
 const products=[],excluded=[];
 const firstBySku={...(previous.firstObservedHistory||{})};
 for(const p of previous.products)firstBySku[String(p.sku)]={firstObservedAt:p.firstObservedAt||previous.observedAt||previous.observedDate,firstNewObservedAt:p.firstNewObservedAt||null,everNew:Boolean(p.everNew||p.newStatus||p.firstNewObservedAt),arrivalEvidence:p.arrivalEvidence||'initial-baseline'};
 for(const p of map.values()){
  const prior=old.get(p.sku),ex=oldExcluded.get(p.sku);
  if(ex||negative.test(p.variantName)){excluded.push(ex||{sku:p.sku,name:p.variantName,reason:'明确非目标商品/真树：依据商品名称与目录记录',sourceUrl:'https://www.therange.co.uk/'+p.variantPath.replace('#','/#')});continue;}
  const sameFamily=prior&&prior.productPath===p.productPath;
  const features={potted:p.categories.includes('potted-christmas-trees')||/\bpotted\b|pot base/i.test(p.variantName),popUp:p.categories.includes('pop-up-trees')||/pop[ -]?up|collapsible/i.test(p.variantName),slim:p.categories.includes('slim-christmas-trees')||/\bslim\b|pencil/i.test(p.variantName),snow:p.categories.includes('snowy-christmas-trees')||/snow|flock|frost/i.test(p.variantName),prelit:p.categories.includes('prelit-christmas-trees')||/pre[ -]?lit|fibre optic|fiber optic|with .*lights/i.test(p.variantName)};
  const explicitNonFlocked=/\bnon[ -]flocked\b/i.test(p.variantName)&&!p.categories.includes('snowy-christmas-trees');
  if(explicitNonFlocked)features.snow=false;
  const kind=p.categories.includes('christmas-tree-skirt')?'skirt':'tree';
  // Prior manual/facet evidence remains dated; never label it freshly rechecked.
  const stableDescription=sameFamily&&prior.variantName===p.variantName;
  let style=nextStyle(features);if(stableDescription&&!(explicitNonFlocked&&prior.style==='雪景款'))style=prior.style;
  const retainedFeatures=stableDescription?{...prior.features}:features;
  if(explicitNonFlocked)retainedFeatures.snow=false;
  const h=firstBySku[p.sku]||{firstObservedAt:now,firstNewObservedAt:null,everNew:false,arrivalEvidence:'observed-after-baseline'};
  if(p.newIn&&!h.everNew){h.firstNewObservedAt=now;h.arrivalEvidence='observed-after-baseline'}h.everNew||=p.newIn;firstBySku[p.sku]=h;
  const out={...(prior||{}),...p,kind,priceGBP:p.price/100,currency:'GBP',sourceUrl:'https://www.therange.co.uk/'+p.variantPath.replace('#','/#'),newStatus:p.newIn,newEvidence:{kind:'website_flag',field:'newIn',value:p.newIn,observedAt:now},observedAt:now,firstObservedAt:h.firstObservedAt,firstNewObservedAt:h.firstNewObservedAt,arrivalEvidence:h.arrivalEvidence,everNew:h.everNew,features:stableDescription?prior.features:features,style,attributeObservedAt:sameFamily?(Object.hasOwn(prior,'attributeObservedAt')?prior.attributeObservedAt:previous.observedAt||previous.observedDate):null,detailEvidence:stableDescription?prior.detailEvidence:undefined,attributeEvidence:stableDescription?prior.attributeEvidence:undefined,heightLabel:sameFamily?prior.heightLabel:'高度未确认',treeColor:sameFamily?prior.treeColor:'颜色未确认',heightValues:sameFamily?prior.heightValues:[],colorValues:sameFamily?prior.colorValues:[],imageStatus:'source-url-current; browser-load-pending'};
  // Keep a separately verified PDP image when the source listing still uses its placeholder.
  if(/placeholder/i.test(out.variantImageUrl||out.imageUrl||'')&&prior?.imageEvidence){out.variantImageUrl=prior.variantImageUrl;out.imageEvidence=prior.imageEvidence;out.imageStatus='PDP override retained; recheck pending';}
  out.rawSourceUrl=out.sourceUrl;out.sourceUrl=out.sourceUrl.replace(/[\u0000-\u001f]/g,'-');
  out.features=retainedFeatures;out.listingFeatures=features;out.listingVariantImageUrl=p.variantImageUrl;
  out.currentDetailFingerprint=detailFingerprint(out);
  if(!out.detailEvidence&&out.arrivalEvidence==='observed-after-baseline'&&!(out.heightValues?.length||out.colorValues?.length))out.attributeObservedAt=null;
  products.push(out);
 }
 const observedDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const result={...previous,products,sources,excluded,conflicts:[],observedDate,observedAt:now,firstObservedHistory:firstBySku,updatedAt:now,imageAudit:{status:'Latest source image addresses obtained; browser-load validation is separate',observedAt:now},automation:{enabled:true,provider:'Firecrawl REST',intervalDays:7,time:'00:00',timezone:'Asia/Shanghai',sourceFields:['name','brand','price','stock','newIn','imageUrl','purchaseUrl'],attributeStatus:'Prior height/colour/PDP evidence remains explicitly dated; not a live re-verification'}};
 result.stats=Object.fromEntries(['tree','skirt'].map(kind=>{const rows=products.filter(p=>p.kind===kind);return [kind,{count:rows.length,newCount:rows.filter(p=>p.newStatus).length}]}));
 result.revision=createHash('sha256').update(JSON.stringify({products:products.map(({observedAt,newEvidence,...p})=>({...p,newEvidence:{...newEvidence,observedAt:undefined}})),sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,v.records]))})).digest('hex');
 return result;
}
function nextStyle(features){return [['potted','圣诞树盆栽'],['popUp','折叠式圣诞树'],['slim','纤细圣诞树'],['snow','雪景款'],['prelit','预亮灯款']].find(([k])=>features[k])?.[1]||'标准／其他装饰待核验';}
export async function sync({previous,reader,onProgress=()=>{},resolvePlaceholderImages=false}){
 const collected={};for(const [category,id]of Object.entries(categories)){onProgress(category);collected[category]=await collectStableCategory(id,reader)}
 const result=mergeSnapshot(previous,collected),issues=[];
 if(resolvePlaceholderImages&&reader.raw)for(const p of result.products){if(!/placeholder/i.test(p.imageUrl||'')&&!/placeholder/i.test(p.variantImageUrl||''))continue;
  try{const response=await reader.raw(p.sourceUrl.split('#')[0]);if(response.data?.metadata?.statusCode!==200)throw Error('Product page unavailable');let image=response.data.metadata['og:image']||response.data.metadata.ogImage;
   if(!image){const tag=response.data.rawHtml?.match(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i)?.[0];image=tag?.match(/\bcontent=["']([^"']+)/i)?.[1];}
   if(!image)throw Error('No product image in PDP metadata');const url=new URL(image.replaceAll('&amp;','&'),p.sourceUrl);if(url.protocol!=='https:'||url.hostname!=='www.therange.co.uk')throw Error('Unexpected image origin');
   p.variantImageUrl=url.href;p.imageEvidence={source:p.sourceUrl.split('#')[0],field:'og:image',url:url.href,observedAt:stamp()};p.imageStatus='Current PDP metadata image address';
  }catch(e){issues.push({sku:p.sku,reason:e.message,retained:Boolean(p.imageEvidence)});}
 }
 result.imageAudit={...result.imageAudit,placeholderIssues:issues,pdpImageCount:result.products.filter(p=>p.imageEvidence?.observedAt).length};
 return result;
}
export async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.next';await fs.writeFile(tmp,JSON.stringify(value));await fs.rename(tmp,file);}
