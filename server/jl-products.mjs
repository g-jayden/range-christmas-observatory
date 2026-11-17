import {jlPhysicalObject} from '../web/jl-physical.mjs';
import {createHash} from 'node:crypto';
import {normaliseColors} from './appearance.mjs';import {duMaterialFacts} from './du-materials.mjs';
import {productDimensions,toCentimetres} from '../web/catalogue-model.mjs';
import {nextExactPrice} from './nx-source.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const jlAppearanceFingerprint=p=>hash([String(p.variantName||'').replace(/\s+/g,' ').trim(),String(p.sourceDescription||'').replace(/\s+/g,' ').trim(),Object.entries(p.specifications||{}).sort(([a],[b])=>a.localeCompare(b))]);

export const jlAllPages=c=>[...c.pages,...(c.ranges||[]).flatMap(r=>r.pages)];
export function jlDirectoryAudit(directory){
 const expectedIds=['baubles','tree','topper','lights','skirt','foliage'];
 if(directory.categories?.length!==6||new Set(directory.categories.map(c=>c.id)).size!==6||expectedIds.some(id=>!directory.categories.some(c=>c.id===id)))throw Error('John Lewis six official directories required');
 const audit=(pages,id)=>{let cursor=1,declared=pages[0]?.count?.[2];const ids=[],entries=[];for(const page of pages){if(page.count?.[0]!==cursor||page.count?.[2]!==declared)throw Error('John Lewis directory changed or a page is missing: '+id);const organic=page.rows.filter(r=>!r.sponsored);if(organic.length!==page.count[1]-page.count[0]+1)throw Error('John Lewis organic page count mismatch');ids.push(...organic.map(r=>r.pageProductId));entries.push(...organic);cursor=page.count[1]+1;}if(cursor-1!==declared||new Set(ids).size!==declared)throw Error('John Lewis directory coverage incomplete: '+id);return {id,expected:declared,observed:ids.length,unique:new Set(ids).size,productRows:entries.filter(r=>r.type!=='range-navigation').length,rangeNavigations:entries.filter(r=>r.type==='range-navigation').length,complete:true};};
 return directory.categories.map(c=>{const ranges=c.ranges||[],entries=jlAllPages(c).flatMap(p=>p.rows).filter(r=>!r.sponsored),rangeUrls=new Set(ranges.map(r=>r.url));for(const r of entries){if(!r.sourceUrl)throw Error('John Lewis entry URL missing');if(r.type==='range-navigation'&&!rangeUrls.has(r.sourceUrl))throw Error('John Lewis product range has not been expanded');}return {...audit(c.pages,c.id),expandedRanges:ranges.map(r=>({...audit(r.pages,c.id+':range'),url:r.url}))};});
}

export function jlOriginalGallery(d){
 const map=new Map();for(const image of d.images||[]){const u=new URL(image.url);if(u.origin!=='https://media.johnlewiscontent.com'||!/^\/i\/JohnLewis\/[a-zA-Z0-9_-]+$/.test(u.pathname))throw Error('Unexpected John Lewis source gallery');
  // Keep the exact asset; remove only retailer image resizing/cropping parameters.
  // The unbounded rendition was verified in the official zoom gallery.
  const parts=u.search.slice(1).split('&').filter(part=>{const key=decodeURIComponent(part.split('=')[0]);return !/^(?:wid|hei|pcropN|crop|fit|sm|scaleFit)$/i.test(key)&&!/^\$rsp-/.test(key);});
  const url=u.origin+u.pathname+(parts.length?'?'+parts.join('&'):'');map.set(u.pathname,{url,sourceDisplayUrl:image.url,sourceAssetId:u.pathname.split('/').at(-1),selectedSku:d.productCode,variantId:d.productCode,sourceParentId:d.pageId,verifiedBy:'John-Lewis-selected-product-code-and-official-gallery-asset'});
 }return [...map.values()];
}

export function jlPhysicalMemberships(d,groups=[]){const brand=d.specifications?.Brand||'',name=brand&&d.name?.startsWith(brand)?brand+' '+d.name.slice(brand.length).trim():d.name;return jlPhysicalObject({name,description:d.description,groups,maxCm:productDimensions(jlSpecs(d),'').maxCm});}

export function jlSpecs(d){
 const specs={...d.specifications};if(specs.Composition)specs.Material=specs.Composition.replace(/\bsea grass\b/ig,'Seagrass');if(specs['Tree height'])specs['Christmas Tree Height']=specs['Tree height'];if(d.selectedColour)specs.Colour=d.selectedColour;
 if(d.selectedSize)specs.Size=d.selectedSize;
 const raw=String(specs.Dimensions||''),units=[...raw.matchAll(/\d+(?:\.\d+)?\s*(cm|mm|m|ft|inches?)\b/ig)].map(m=>m[1]),sharedUnit=new Set(units.map(s=>s.toLowerCase())).size===1?units[0]:/["″]\s*$/.test(raw)?'inches':null;
 for(const m of raw.matchAll(/\b([HWDL])\s*:?\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)?/ig)){const unit=m[3]||sharedUnit;if(unit)specs[({H:'Height',W:'Width',D:'Depth',L:'Length'})[m[1].toUpperCase()]]=m[2]+unit;}
 const diameter=raw.match(/\bDia(?:meter)?\.?\s*:?\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)?/i);if(diameter&&(diameter[2]||sharedUnit))specs.Diameter=diameter[1]+(diameter[2]||sharedUnit);if(specs['Maximum diameter'])specs.Diameter=specs['Maximum diameter'];
 if(specs['Tree height']){if(specs.Height&&toCentimetres(specs.Height)!==toCentimetres(specs['Tree height']))specs['Source Height']=specs.Height;specs.Height=specs['Tree height'];}
 return specs;
}

export function jlDimensionFacts(d,specs){
 const notes=[],lit=String(d.name).match(/\blit length\s*(\d+(?:\.\d+)?)\s*(cm|mm|m)\b/i),litCm=lit?toCentimetres(lit[1]+lit[2]):null,height=toCentimetres(specs.Height||'');
 if(litCm){specs.Length=lit[1]+lit[2];if(height&&Math.abs(height-litCm)<Math.max(2,litCm*.03)){specs['Source Height']=specs.Height;delete specs.Height;notes.push('商品名明确标注的是发光长度；未作为灯饰高度统计 · The title specifies lit length, not product height');}}
 let uncertain=false;if(toCentimetres(specs.Height||'')>1000&&/wire star|firecracker lights/i.test(d.name)){uncertain=true;specs['Source Height']=specs.Height;delete specs.Height;notes.push('官网紧凑灯饰的高度计量存在疑点，保留原文，未擅自修改单位或计入高度分析 · Suspect source height for a compact light; raw value retained without guessing a corrected unit');}
 const usable={...specs};if(uncertain){delete usable.Dimensions;delete usable.Size;}
 return {dimensions:productDimensions(usable,''),notes};
}

export function jlMaterialFacts(specs,description){
 const facts=duMaterialFacts(specs,description),translate=en=>/palladium plated/i.test(en)?'镀钯层':/gold plated/i.test(en)?'镀金层':/22\s*(?:ct|carat)\s*gold/i.test(en)?'22K金（原站标注）':/18\s*(?:ct|carat)\s*gold/i.test(en)?'18K金（原站标注）':null;
 const components=facts.components.map(v=>({...v,zh:translate(v.en)||v.zh}));return {...facts,components,label:components.length?components.map(v=>v.zh+'（'+v.en+'）').join(' / '):facts.label};
}

export function jlSourcePrices(d){
 if(d.structuredPrice){const current=nextExactPrice(d.priceText);if(current===null||current!==d.structuredPrice.current)throw Error('John Lewis variant price formats disagree');const was=d.structuredPrice.was;return {price:current,priceGBP:current/100,originalPrice:was,originalPriceKind:was?'WAS':null,sourcePriceBadge:d.structuredPrice.badge||''};}
 const current=nextExactPrice(d.priceText);if(current===null){if(d.inStock===false&&!d.priceText)return {price:null,priceGBP:null,originalPrice:null,originalPriceKind:null,sourcePriceBadge:'',sourceOfferUnavailable:true};throw Error('John Lewis exact selected-variant price required: '+d.productCode);}
 const header=String(d.headerText||'').split('Free Click & Collect')[0].split('Colours')[0].split('Sizes')[0],badge=header.match(/(?:^|\n)(Save [^\n]+)(?:\n|$)/i)?.[1]||'',values=[...header.matchAll(/£[\d,]+(?:\.\d{2})?/g)].map(m=>nextExactPrice(m[0]));
 const was=badge&&values.length===2&&values[1]===current&&values[0]>current?values[0]:null;
 return {price:current,priceGBP:current/100,originalPrice:was,originalPriceKind:was?'WAS':null,sourcePriceBadge:badge};
}

export function buildJlSnapshot(directory,evidence,{previous={products:[]},allowIncomplete=false}={}){
 const audits=jlDirectoryAudit(directory);
 if(!allowIncomplete&&(evidence.pending?.length||evidence.failures?.length||evidence.conflicts?.length))throw Error('John Lewis variants or detail evidence remain incomplete');
 const memberships=new Map();for(const c of directory.categories)for(const page of jlAllPages(c))for(const row of page.rows.filter(r=>!r.sponsored&&r.type!=='range-navigation')){const groups=memberships.get(row.pageProductId)||new Set();groups.add(c.id);memberships.set(row.pageProductId,groups);}
 const represented=new Set(Object.values(evidence.products).flatMap(d=>d.sourceParentIds||[d.pageId]));
 if(!allowIncomplete&&[...memberships.keys()].some(id=>!represented.has(id)))throw Error('John Lewis family details missing');
 const old=new Map(previous.products.map(p=>[p.sku,p])),baseline=!previous.notificationBaselineReady,products=[];
 for(const d of Object.values(evidence.products)){
  const sourceUrl=new URL(d.sourceUrl);sourceUrl.hash='';
  const sku=String(d.productCode),groups=[...new Set((d.sourceParentIds||[d.pageId]).flatMap(id=>[...(memberships.get(id)||[])]))],gallery=jlOriginalGallery(d);if(!/^\d{8}$/.test(sku)||!groups.length||!gallery.length)throw Error('John Lewis exact SKU, category or photo identity missing');
  const prior=old.get(sku),specifications=jlSpecs(d),dimensionFacts=jlDimensionFacts(d,specifications),dimensions=dimensionFacts.dimensions,material=jlMaterialFacts(specifications,d.description),departmentIds=jlPhysicalMemberships(d,groups),department=departmentIds[0]||null;
  const newStatus=typeof d.sourceNew==='boolean'?d.sourceNew:/(?:^|\n)New(?: In)?(?:\n|$)/i.test(d.headerText||''),brand=specifications.Brand||'John Lewis',name=d.name.startsWith(brand)?brand+' '+d.name.slice(brand.length).trim():d.name;
  const p={...prior,retailerId:'jl',retailerName:'John Lewis & Partners',recordType:'sku',sku,variantId:sku,parentGroupId:d.pageId,baseName:name,variantName:name,brand,sourceUrl:sourceUrl.href,sourceDescription:d.description||'',productSummary:d.description||name,observedAt:d.observedAt,attributeObservedAt:d.observedAt,detailsReady:true,sourceDescriptionAbsent:!d.description,detailEvidence:{selectedSku:sku,sourceParentId:d.pageId,sourceUrl:sourceUrl.href,verifiedProductSection:true,observedAt:d.observedAt,sourceTransport:d.sourceTransport||'John-Lewis-official-product-DOM',descriptionHash:hash(d.description||''),specificationHash:hash(specifications)},jlSource:{groups,pageProductId:d.pageId,productCode:sku,selectedColour:d.selectedColour||null,selectedSize:d.selectedSize||null,rawDimensions:d.specifications.Dimensions||null,sourcePriceText:d.priceText,sourceStockEvidence:d.stockEvidence},...jlSourcePrices(d),inStock:d.inStock===true,newStatus,everNew:prior?.everNew||newStatus,baselineRecord:prior?.baselineRecord||baseline,department,departmentIds,kind:department==='jl-tree'?'tree':department==='jl-skirt'?'skirt':'decoration',specifications,dimensions,material:material.label,sourceColour:specifications.Colour||'',images:gallery.map(g=>g.url),originalImages:gallery,imageUrl:gallery[0].url,variantImageUrl:gallery[0].url,originalImageUrl:gallery[0].url};
  p.colorValues=normaliseColors(p.sourceColour);p.treeColor=p.colorValues.join(' / ');p.appearanceSource={materials:material};if(!department)p.taxonomyAudit={disposition:'exclude',memberships:[],reason:'不属于指定七个圣诞商品本体类目 · Outside the seven requested physical Christmas categories'};
  if(dimensionFacts.notes.length)p.dimensionNotes=dimensionFacts.notes;
  if(!/\d\s*(?:cm|mm|m|ft|inches?)\b|["″]/i.test(String(d.specifications.Dimensions||''))&&d.specifications.Dimensions)p.dimensionSourceNote=/^(?:cm|mm|m|ft|inches?)$/i.test(d.specifications.Dimensions.trim())?'官网尺寸栏仅标单位，没有给出数值 · Source size field gives a unit without numeric measurements':'官网该尺寸栏未标计量单位，保留原文，不推算厘米 · Source dimensions omit units; raw dimensions retained without assuming centimetres';
  if(p.kind==='tree'){const declared=toCentimetres(specifications['Christmas Tree Height']||''),exact=declared||toCentimetres(d.selectedSize||'')||toCentimetres(specifications.Height||'');p.heightCm=exact||null;p.heightLabel=specifications['Christmas Tree Height']||d.selectedSize||specifications.Height||null;if(declared&&dimensions.values.Height&&Math.abs(declared-dimensions.values.Height)>Math.max(8,declared*.12))p.dimensionSourceNote='官网尺寸字段存在冲突；树高按独立树高字段，原始尺寸保留 · Source dimensions conflict; dedicated tree-height field used; raw dimensions retained';const t=name.toLowerCase();p.style=/potted|\bin a pot\b/.test(t)?'圣诞树盆栽':/pop.?up|collapsible/.test(t)?'折叠式圣诞树':/slim|pencil/.test(t)?'纤细圣诞树':/flock|frost|snow/.test(t)?'雪景款':/twig|metal|tinsel|paper|acrylic/.test(t)?'其它树形类别':/pre.?lit|lit (?:christmas )?tree/.test(t)?'预亮灯款':'标准款';}
  if(p.kind==='skirt')p.skirtSizeCm=p.dimensions.values.Diameter||p.dimensions.maxCm||null;
  if(!baseline&&p.inStock&&newStatus&&!prior?.everNew&&!prior?.baselineRecord){p.firstNewObservedAt=d.observedAt;p.arrivalEvidence='observed-after-baseline';}products.push(p);
 }
 return {retailerId:'jl',sourceUrl:'https://www.johnlewis.com/menu/c5000025',observedAt:directory.observedAt,baselineReady:!allowIncomplete,notificationBaselineReady:previous.notificationBaselineReady||false,sourceAudits:audits,sourceCounts:Object.fromEntries(audits.map(a=>[a.id,a.expected])),uniqueParentCodes:memberships.size,products,revision:hash(products)};
}
