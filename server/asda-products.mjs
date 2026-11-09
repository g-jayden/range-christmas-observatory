import {createHash} from 'node:crypto';
import {asdaMemberships} from '../web/asda-model.mjs';
import {normaliseColors,materialFacts,descriptionFacts} from './appearance.mjs';
import {productDimensions,toCentimetres} from '../web/catalogue-model.mjs';
const text=s=>String(s||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
export const asdaFingerprint=p=>createHash('sha256').update(JSON.stringify([p.sku,p.variantName,p.listingVariantImageUrl||p.variantImageUrl,p.asdaSource?.primaryCategoryID])).digest('hex');
export function asdaDimensionFacts(specifications={},description='',title=''){
 const specs={...specifications},raw=specs['Dimensions (WxDxH in cm)'];if(!raw)return {specifications:specs,dimensions:productDimensions(specs,description)};
 // Keep the original complete string, including mixed sizes, in every export.
 if(!/^\s*(?:#n\/a|n\/a|not specified)\s*$/i.test(raw))specs.Dimensions=raw;
 const unit='(?:cm|mm|m|ft|feet|inches?|in)',defaultUnit=[...raw.matchAll(new RegExp('('+unit+')\\b','ig'))].at(-1)?.[1]||'cm',axes={W:'Width',D:'Depth',H:'Height',L:'Length'};
 const assign=(key,value)=>{const n=toCentimetres(value);if(!(n>0))return;if(specs[key]&&toCentimetres(specs[key])!==n)specs['Source '+key]??=specs[key];specs[key]=n+'cm';};
 for(const m of raw.matchAll(new RegExp('(?:^|[\\s:x×])([WDHL])\\s*([\\d.]+)\\s*('+unit+')?\\b','ig')))assign(axes[m[1].toUpperCase()],m[2]+(m[3]||defaultUnit));
 const triple=raw.match(new RegExp('^\\s*([\\d.]+)\\s*('+unit+')?\\s*[x×]\\s*([\\d.]+)\\s*('+unit+')?\\s*[x×]\\s*([\\d.]+)\\s*('+unit+')?\\s*$','i'));
 if(triple)for(const [i,key]of ['Width','Depth','Height'].entries())assign(key,triple[i*2+1]+(triple[i*2+2]||defaultUnit));
 for(const key of ['Height','Width','Depth','Length','Diameter']){
  const before=raw.match(new RegExp('\\b'+key+'\\s*:?\\s*(?:approx\\.?\\s*)?([\\d.]+)\\s*('+unit+')\\b','i')),after=raw.match(new RegExp('([\\d.]+)\\s*('+unit+')\\s*'+key+'\\b','i'));
  if(before||after){const m=before||after;assign(key,m[1]+m[2]);}
 }
 const original=specs['Source Height'],originalCm=toCentimetres(original),height=toCentimetres(specs.Height),titleMeasures=[...title.matchAll(new RegExp('(\\d+(?:\\.\\d+)?)\\s*('+unit+')(?![a-z])','ig'))].map(m=>toCentimetres(m[1]+m[2]));
 // Some marketplace rows put depth under Height. A native Height field and
 // an agreeing title establish the intended axis without guessing from pixels.
 if(originalCm>0&&height>0&&Math.abs(height-originalCm)>Math.max(5,originalCm*.12)&&titleMeasures.some(n=>Math.abs(n-originalCm)<2)){specs['Dimension column Height']=specs.Height;specs.Height=original;}
 let dimensions=productDimensions(specs,description);if(!dimensions.maxCm&&/^\s*[\d.]+\s*[x×]\s*[\d.]+\s*$/.test(raw)){dimensions=productDimensions({...specs,Dimensions:raw+'cm'},description);dimensions.sourceSize=raw;dimensions.evidence.Max={value:raw,source:'ASDA size specification; centimetres in column heading',axisOrderUnknown:true};}
 return {specifications:specs,dimensions};
}
export function asdaVariantListings(group,listing,pricing){
 if(!Array.isArray(group.variants)||!pricing?.productAvailability)throw Error('ASDA variant evidence missing');
 const ids=new Set(group.variants.map(v=>String(v.ID)));
 if(Object.keys(pricing.productAvailability).some(id=>!ids.has(id)))throw Error('ASDA variant-price membership mismatch');
 return group.variants.map(v=>{
  const sku=String(v.ID),offer=pricing.productAvailability[sku];if(!offer?.price||typeof offer.availability?.instock!=='boolean')throw Error('Exact ASDA variant offer missing: '+sku);
  const options=Object.values(v.variationAttributes||{}).map(o=>o.displayValue||o.value).filter(Boolean),name=v.name+(options.length?' · '+options.join(' / '):'');
  const detail={...group,...v,id:sku,name,URL:v.URL,productType:'variant',variants:undefined,parentGroupId:group.id,sourceStructuredData:undefined};
  return {listing:{...listing,...detail,price:offer.price,productAvailable:offer.availability.instock,badgesInformation:v.badgesInformation,savingsBadge:offer.savingsBadge||null,badge:offer.badge||v.badge||null,recordType:'sku'},detail,options,parentGroupId:group.id};
 });
}
export function normaliseAsdaProduct(listing,detail,{observedAt,previous=null,baseline=false}={}){
 const raw=listing,sku=String(raw.id);if(!/^(?:\d{8,12}|GEM\d{4,12}|SET\d{4,12})$/.test(sku))throw Error('Invalid ASDA SKU');if(detail&&String(detail.id)!==sku)throw Error('ASDA detail SKU mismatch');
 const source=detail||raw,url=source.URL||raw.URL;if(!url||new URL(url).origin!=='https://direct.asda.com'||!new URL(url).pathname.includes('/'+sku+','))throw Error('Exact ASDA product URL missing');
 const price=raw.price||{},sale=price.sales||price.sale,current=sale?.value??price.list?.value??price.min?.sales?.value??price.min?.list?.value;
 if(!Number.isFinite(current))throw Error('ASDA price missing for '+sku);
 const old=price.list?.value,original=Number.isFinite(old)&&old>current?Math.round(old*100):null;
 const badge=[raw.badge?.badgeMessage,raw.badge?.badgeType,raw.badge?.squareBadge].filter(Boolean).join(' '),newStatus=/\bnew\b/i.test(badge);
 const images=(source.media?.images||[]).filter(g=>g.image?.url).map(g=>g.image.url),originalImages=(source.media?.images||[]).filter(g=>g.zoomImage?.url).map(g=>({thumbnail:g.image.url,url:g.zoomImage.url,width:Number(g.zoomImage.width),height:Number(g.zoomImage.height),selectedSku:sku,verifiedBy:'ASDA exact-SKU zoomImage'}));
 const variantImageUrl=images[0]||previous?.variantImageUrl;
 const p={...previous,retailerId:'asda',retailerName:'ASDA · George',recordType:sku.startsWith('SET')?'product-set':sku.startsWith('GEM')?'product-family':'sku',priceFrom:raw.price?.type==='range',sku,sourceUrl:url,variantName:raw.name||source.name,brand:source.brand||raw.brand||'George',priceGBP:current,price:Math.round(current*100),originalPrice:original,promoText:text(raw.savingsBadge?.savingsDisplayValue||''),newStatus,everNew:previous?.everNew||newStatus,observedAt,inStock:raw.productAvailable===true&&!raw.badgesInformation?.availableSoonBadgeInformation?.displayAvailableSoonBadge,variantImageUrl,listingVariantImageUrl:raw.media?.images?.[0]?.image?.url,imageUrl:variantImageUrl,images,originalImages,asdaSource:{primaryCategoryID:source.primaryCategoryID||raw.primaryCategoryID,customType:raw.customType,sourceBadge:raw.badge,savingsBadge:raw.savingsBadge},sourceColour:source.colour||raw.colour};
 if(!p.colorValues?.length)p.colorValues=normaliseColors(p.sourceColour);
 if(originalImages[0])p.originalImageUrl=originalImages[0].url;
 if(!detail&&previous&&previous.detailInputFingerprint!==asdaFingerprint(p)){p.detailsReady=false;delete p.detailEvidence;p.attributeObservedAt=null;}
 if(!detail&&previous?.detailsReady&&previous.detailInputFingerprint===asdaFingerprint(p)){p.variantImageUrl=previous.variantImageUrl;p.images=previous.images;p.originalImages=previous.originalImages;p.originalImageUrl=previous.originalImageUrl;}
 p.baselineRecord=previous?.baselineRecord||baseline;
 if(!baseline&&!previous)p.firstSeenAfterBaselineAt=observedAt;
 if(!baseline&&p.inStock&&(!previous||!previous.inStock&&!previous.everInStock&&!previous.baselineRecord&&previous.firstSeenAfterBaselineAt)){p.firstNewObservedAt=observedAt;p.arrivalEvidence='observed-after-baseline';p.everNew=true;}
 p.everInStock=previous?.everInStock||previous?.inStock||p.inStock;
 if(raw.parentGroupId){p.parentGroupId=raw.parentGroupId;p.priceEvidence={source:'ASDA Product-GetPriceData',selectedSku:sku,parentGroupId:raw.parentGroupId,observedAt};}
 if(detail){
  p.sourceDescription=text(detail.longDescription||detail.productDescriptionAttributes?.longDescription);p.productSummary=p.sourceDescription;
  const specifications=Object.fromEntries((detail.attributes||[]).filter(x=>x.value!==null&&x.value!==undefined&&String(x.value)!=='').map(x=>[x.key,String(x.value)]));
  const facts=asdaDimensionFacts(specifications,p.sourceDescription,p.variantName);Object.assign(specifications,facts.specifications);
  p.specifications=specifications;p.dimensions=facts.dimensions;p.material=materialFacts(specifications,p.sourceDescription).label;
  p.appearanceSource=descriptionFacts(p,specifications,p.sourceDescription);p.colorValues=normaliseColors(source.colour||specifications.Colour);p.treeColor=p.colorValues.join(' / ');p.heightCm=p.dimensions.values.Height||toCentimetres(specifications.Height);p.heightLabel=specifications.Height||null;
  p.attributeObservedAt=observedAt;p.detailsReady=true;p.detailEvidence={selectedSku:sku,verifiedProductSection:true,sourceUrl:url,observedAt,text:p.sourceDescription,sourceTransport:'ASDA-native-productData'};delete p.detailIssue;
 }
 const cls=asdaMemberships(p);p.department=cls.primary;p.departmentIds=cls.memberships;p.kind=cls.primary==='asda-tree'?'tree':'decoration';p.classificationEvidence=cls;p.detailInputFingerprint=asdaFingerprint(p);
 if(p.kind==='tree'){const t=p.variantName+' '+(p.sourceDescription||'');p.style=/\bpott?ed\b/i.test(t)?'圣诞树盆栽':/pop[ -]?up|collapsible/i.test(t)?'折叠式圣诞树':/slim|pencil/i.test(t)?'纤细圣诞树':/snow|flock/i.test(t)?'雪景款':/pre[ -]?lit/i.test(t)?'预亮灯款':/\b(?:twig|birch|cone)\b/i.test(t)?'其他树形类别':'标准款';}
 return p;
}
