import{createHash}from'node:crypto';

import{duMaterialFacts}from'./du-materials.mjs';
import{normaliseColors}from'./appearance.mjs';
import{productDimensions,toCentimetres}from'../web/catalogue-model.mjs';
import{jlTreeStyle}from'./jl-products.mjs';
import{arMemberships,AR_DEPARTMENTS}from'../web/ar-model.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function arPlainText(value){
 const entities={amp:'&',quot:'"',apos:"'",nbsp:' ',bull:'•',middot:'·',times:'×',deg:'°',Phi:'Φ',phi:'φ',Oslash:'Ø',oslash:'ø',ndash:'–',mdash:'—',lt:'<',gt:'>'};
 return String(value||'').replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/ig,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';}).replace(/&([a-z]+);/ig,(all,k)=>entities[k]??all).replace(/[ \t]+/g,' ').trim();
}
export const arValidSku=sku=>/^(?:\d{7}|[a-z0-9]{8})$/.test(String(sku));
export function arGallery(d,sku){
 const native=d.legacy?.media?.images||d.structuredProduct.image||[];
 const rows=[...new Set((Array.isArray(native)?native:[native]).map(v=>typeof v==='string'?v:v.url).filter(Boolean))];
 if(!rows.length)throw Error('Argos original gallery absent: '+sku);
 return rows.map(url=>{const u=new URL(url);if(u.origin!=='https://media.4rgos.it'||!u.pathname.startsWith('/i/Argos/'))throw Error('Unexpected Argos original image source');
  const meta=d.legacy?.media?.meta?.[url]||{};return{url:u.href,selectedSku:sku,variantId:sku,sourceParentId:sku,sourceUrl:d.sourceUrl,sourceWidth:Number(meta.width)||null,sourceHeight:Number(meta.height)||null,verification:'exact-public-Product-SKU-and-official-gallery'};
 });
}
export function arSpecifications(d){
 const a=d.legacy?.dimensions?.attributes||{},s={},description=arPlainText(d.structuredProduct.description||''),title=arPlainText(d.structuredProduct.name);
 for(const[k,v]of Object.entries(a))if(v!==null&&v!==undefined&&v!=='')s[k[0].toUpperCase()+k.slice(1)]=String(v);
 const boundary='(?:Colour|Color|Material|Tree width|Total height|Tree height|Height|Width|Length|Depth|Stand size|Overall dimensions|Dimensions|Size|With \\d+|Assembly required|Power source|Number of|Voltage|Suitable for)';
 const field=label=>description.match(new RegExp('\\b'+label+'\\s*:\\s*(.{1,160}?)(?=\\s+'+boundary+'\\s*:|[\\n•;]|$)','i'))?.[1]?.trim();
 if(field('Colou?r'))s.Colour=field('Colou?r');if(field('Material'))s.Material=field('Material');
 // Argos often lists boxed dimensions in the same Product description. They
 // describe shipping packaging, not the assembled product. Remove only those
 // source clauses from product-size parsing; retain the full description.
 const dimensionsText=description.replace(/\b(?:boxed|box|packaged?|packed|shipping|carton)\s+(?:size|dimensions)\s*:?\s*[^;\n•]*(?:;|$)/ig,'');
 const measure='(\\d+(?:\\.\\d+)?)\\s*(cm|mm|m|ft|inches?)\\b';
 for(const[label,key]of [['Total height','Height'],['Tree height','Height'],['Tree width','Width'],['Height','Height'],['Width','Width'],['Diameter','Diameter'],['Length','Length'],['Depth','Depth']]){
  const match=dimensionsText.match(new RegExp('\\b'+label+'\\s*:\\s*'+measure,'i'));if(match&&!/\b(?:cable|cord|wire|lead|stand|lights?|LEDs?)\s*$/i.test(dimensionsText.slice(Math.max(0,match.index-12),match.index)))s[key]||=match[1]+match[2];
 }
 const explicit=dimensionsText.match(/(?:^|[;.•\n])\s*(?:Size|Dimensions)\s*:?\s*((?:[HWDL]\s*\d+(?:\.\d+)?\s*(?:cm|mm|m|ft|inches?)?\s*[,×x]?\s*){1,4})/i)?.[1]?.trim();
 if(!s.Size&&explicit)s.Size=explicit;
 const size=String(s.Size||''),shared=[...size.matchAll(/\d\s*(cm|mm|m|ft|inches?)\b/ig)].at(-1)?.[1];
 for(const m of size.matchAll(/\b([HWDL])\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)?/ig))if(m[3]||shared)s[({H:'Height',W:'Width',D:'Depth',L:'Length'})[m[1].toUpperCase()]]||=m[2]+(m[3]||shared);
 const treeHeight=dimensionsText.match(/\b(\d+(?:\.\d+)?)\s*(ft|cm)\s+(?:(?:artificial|christmas|xmas|pine|spruce)\s+)*tree\b/i);
 if(!s.Height&&treeHeight&&/\btree\b/i.test(title))s.Height=treeHeight[1]+treeHeight[2];
 const base=dimensionsText.match(/\bbase of (?:the )?tree diameter\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)\b/i);if(base)s['Base Diameter']=base[1]+base[2];
 const dimension=field('Overall dimensions')||field('Dimensions');if(dimension&&!s.Size&&/\d\s*[x×]/i.test(dimension))s.Size=dimension;
 const specifiedSize=dimensionsText.match(/(?:^|[;.•\n])\s*(?:Approx(?:imate)?\s+)?(?:Size|Dimensions)\s*:\s*([^;\n•]{1,110})/i)?.[1]?.trim();
 if(!s.Size&&specifiedSize&&/\d+(?:\.\d+)?\s*(?:cm|mm|m|ft|inches?)\b/i.test(specifiedSize))s.Size=specifiedSize;
 if(!s.Size&&!s.Height&&!s.Length&&!s.Diameter){const measured=dimensionsText.match(/\bMeasures\s+(\d+(?:\.\d+)?\s*(?:cm|mm|m|ft|inches?))\b/i);if(measured)s.Size=measured[1];}
 const familyBlocks=[...dimensionsText.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:FT|ft)\s*[:：]/g)],titleHeight=title.match(/\b(\d+(?:\.\d+)?)\s*(cm|ft)\b/i);
 if(familyBlocks.length>1&&titleHeight){const selectedCm=toCentimetres(titleHeight[1]+titleHeight[2]),block=familyBlocks.find(m=>Math.abs(Number(m[1])*30.48-selectedCm)<3);if(block){const next=familyBlocks.find(m=>m.index>block.index),text=dimensionsText.slice(block.index,next?.index),height=text.match(/(?:height|size)[^\n]{0,35}?(\d+(?:\.\d+)?)\s*cm/i),diameter=text.match(/[ΦφØø]\s*(\d+(?:\.\d+)?)\s*cm/i);if(height&&Math.abs(Number(height[1])-selectedCm)<5)s.Height=height[1]+'cm';if(diameter)s.Diameter=diameter[1]+'cm';}}
 // A title's garland length is SKU-specific. Do not promote a tree stand's
 // supported tree height, a cable length or a chain's maximum combined length.
 if(/\bgarland\b/i.test(title)&&!/\b(?:cable|cord|wire|lead|chain of|up to)\b/i.test(title)&&!s.Length){const length=title.match(/\b(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)\b/i);if(length)s.Length=length[1]+length[2].toLowerCase();}
 if(/\b(?:skirt|collar)\b/i.test(title)){
  const collar=dimensionsText.match(/\bMeasuring\s+(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)\s+across the top,?\s+(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)\s+across the base and\s+(\d+(?:\.\d+)?)\s*(cm|mm|m|ft|inches?)\s+high\b/i);
  if(collar){s['Top Diameter']||=collar[1]+collar[2];s['Base Diameter']||=collar[3]+collar[4];s.Height||=collar[5]+collar[6];}
 }
 return s;
}
export function arDirectoryAudit(source){
 const required=['tree','baubles','tree-decorations','wreath-garland','skirt-stand','inflatables-search'];
 for(const id of required){const c=source.categories.find(c=>c.id===id);if(!c?.complete)throw Error('Argos official directory not complete: '+id);}
 return source.categories.map(c=>{const rows=c.pages.flatMap(p=>p.props.productData),ids=new Set(rows.map(r=>String(r.id)));if(!c.complete||c.unique!==c.expected||ids.size!==c.expected)throw Error('Argos exact directory coverage mismatch: '+c.id);return{id:c.id,expected:c.expected,observed:ids.size,unique:ids.size,complete:true};});
}
export function buildArSnapshot(source,details,{previous={products:[]},allowIncomplete=false}={}){
 const sourceAudits=arDirectoryAudit(source),sourceRows=new Map(),old=new Map(previous.products.map(p=>[p.sku,p]));
 for(const c of source.categories)for(const page of c.pages)for(const r of page.props.productData){const sku=String(r.id);if(!arValidSku(sku))throw Error('Invalid Argos public product ID');const saved=sourceRows.get(sku)||{row:r,groups:[]};if(!saved.listedAt||r.attributes?.price!=null&&(saved.row.attributes?.price==null||Date.parse(r.attributes?.priceObservedAt||page.observedAt)>Date.parse(saved.listedAt))){saved.row=r;saved.listedAt=r.attributes?.priceObservedAt||page.observedAt;saved.listedUrl=page.url;}saved.groups.push(c.id);sourceRows.set(sku,saved);}
 const baseline=!previous.notificationBaselineReady,products=[],pending=[];
 for(const[sku,{row,groups,listedAt,listedUrl}]of sourceRows){
  const d=details[sku];if(!d){pending.push(sku);continue;}
  const structured=d.structuredProduct,legacy=d.legacy,offer=structured?.offers;
  if(String(structured?.sku)!==sku||new URL(d.sourceUrl).pathname!=='/product/'+sku)throw Error('Argos selected detail identity conflict: '+sku);
  if(offer?.priceCurrency!=='GBP')throw Error('Argos GBP source offer required: '+sku);
  const detailPrice=Number(offer.price),listingPrice=row.attributes?.price==null||row.attributes.price===''?NaN:Number(row.attributes.price),listingCurrent=Number.isFinite(listingPrice)&&listingPrice>=0&&Date.parse(listedAt)>Date.parse(d.observedAt),current=listingCurrent?listingPrice:detailPrice,lp=legacy?.prices?.attributes||d.flight?.pricing,prior=old.get(sku);if(!Number.isFinite(current)||current<0||lp&&Number(lp.now)!==detailPrice)throw Error('Argos exact source price conflict: '+sku);
  const sourceDescription=arPlainText(structured.description||legacy?.attributes?.description||''),specifications=arSpecifications(d),dimensions=productDimensions(specifications),materials=duMaterialFacts(specifications,sourceDescription),gallery=arGallery(d,sku),a=legacy?.attributes||d.flight?.availability||{},listing=row.attributes||{},newStatus=(listingCurrent?false:(legacy?.badges||[]).some(b=>b.attributes?.badgeReference==='new_badge'))||listing.badge?.BADGE_PRODUCT?.includes('new_badge')===true;
  const was=Number(listingCurrent?listing.wasPrice:lp?.was??listing.wasPrice),sourceColour=specifications.Colour||'',p={...prior,retailerId:'ar',retailerName:'Argos',recordType:'sku',sku,sourceSku:sku,variantId:sku,parentGroupId:sku,baseName:structured.name,variantName:structured.name,brand:structured.brand?.name||listing.brand||'Argos',sourceUrl:d.sourceUrl,sourceDescription,productSummary:sourceDescription,sourceDescriptionAbsent:!sourceDescription,detailsReady:true,observedAt:listingCurrent?listedAt:d.observedAt,priceEvidence:{sourceUrl:listingCurrent?listedUrl:d.sourceUrl,observedAt:listingCurrent?listedAt:d.observedAt,selectedSku:sku,method:listingCurrent?'exact-current-official-directory-SKU':'exact-current-public-Product-offer'},attributeObservedAt:d.observedAt,detailEvidence:{selectedSku:sku,sourceParentId:sku,sourceUrl:d.sourceUrl,verifiedProductSection:true,sourceTransport:legacy?'Argos-selected-Product-JSON-LD-and-legacy-business-state':'Argos-selected-Product-JSON-LD-and-app-router-page',descriptionHash:hash(sourceDescription),specificationHash:hash(specifications),observedAt:d.observedAt},arSource:{groups:[...new Set(groups)],listedPrice:listing.price,listedWasPrice:listing.wasPrice,marketplace:listing.soldByTrustedSeller===true,sourceProductId:sku},priceGBP:current,price:Math.round(current*100),originalPrice:Number.isFinite(was)&&was>current?Math.round(was*100):null,originalPriceKind:Number.isFinite(was)&&was>current?'WAS':null,sourcePriceBadge:listingCurrent?(listing.specialOfferText||''):(lp?.flashText||listing.specialOfferText||''),inStock:listingCurrent&&(typeof listing.deliverable==='boolean'||typeof listing.reservable==='boolean')?(listing.deliverable===true||listing.reservable===true):a.globallyOutOfStock!==true&&a.endOfLineOutOfStock!==true&&(a.deliverable===true||a.collectable===true||listing.deliverable===true||listing.reservable===true),newStatus,everNew:prior?.everNew||newStatus,baselineRecord:prior?.baselineRecord||baseline,specifications,dimensions,material:materials.label,appearanceSource:{materials},sourceColour,colorValues:normaliseColors(sourceColour),images:gallery.map(g=>g.url),originalImages:gallery,imageUrl:gallery[0].url,variantImageUrl:gallery[0].url,originalImageUrl:gallery[0].url};
  const c=arMemberships(p);p.department=c.primary;p.departmentIds=c.memberships;p.classificationEvidence=c;p.kind=p.department==='ar-tree'?'tree':p.department==='ar-skirt-stand'?'skirt':'decoration';p.treeColor=p.colorValues.join(' / ');
  if(p.kind==='tree'){p.heightCm=toCentimetres(specifications.Height)||null;p.heightLabel=specifications.Height||specifications.Size||'';p.style=jlTreeStyle(p.baseName,specifications);}if(p.kind==='skirt')p.skirtSizeCm=dimensions.values.Diameter||dimensions.maxCm||null;
  if(!p.department)p.taxonomyAudit={disposition:'exclude',memberships:[],reason:c.reason};
  if(!baseline&&p.inStock&&newStatus&&!prior?.everNew&&!prior?.baselineRecord){p.firstNewObservedAt=d.observedAt;p.arrivalEvidence='observed-after-baseline';}
  products.push(p);
 }
 if(pending.length&&!allowIncomplete)throw Error('Argos exact details remain incomplete: '+pending.length);
 return{retailerId:'ar',sourceUrl:'https://www.argos.co.uk/events/christmas-gifts',observedAt:source.observedAt,collectionComplete:!pending.length,baselineReady:!pending.length,notificationBaselineReady:previous.notificationBaselineReady||false,sourceCounts:Object.fromEntries(sourceAudits.map(a=>[a.id,a.expected])),sourceAudits,sourceProductIds:sourceRows.size,products,pendingDetails:pending,revision:hash(products)};
}
