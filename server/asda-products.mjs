import {createHash} from 'node:crypto';
import {asdaMemberships} from '../web/asda-model.mjs';
import {normaliseColors,materialFacts,descriptionFacts} from './appearance.mjs';
import {productDimensions,toCentimetres} from '../web/catalogue-model.mjs';
const text=s=>String(s||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
export const asdaFingerprint=p=>createHash('sha256').update(JSON.stringify([p.sku,p.variantName,p.listingVariantImageUrl||p.variantImageUrl,p.asdaSource?.primaryCategoryID])).digest('hex');
export function normaliseAsdaProduct(listing,detail,{observedAt,previous=null,baseline=false}={}){
 const raw=listing,sku=String(raw.id);if(!/^(?:\d{8,12}|GEM\d{4,12}|SET\d{4,12})$/.test(sku))throw Error('Invalid ASDA SKU');if(detail&&String(detail.id)!==sku)throw Error('ASDA detail SKU mismatch');
 const source=detail||raw,url=source.URL||raw.URL;if(!url||new URL(url).origin!=='https://direct.asda.com'||!new URL(url).pathname.includes('/'+sku+','))throw Error('Exact ASDA product URL missing');
 const price=raw.price||{},sale=price.sales||price.sale,current=sale?.value??price.list?.value??price.min?.sales?.value??price.min?.list?.value;
 if(!Number.isFinite(current))throw Error('ASDA price missing for '+sku);
 const old=price.list?.value,original=Number.isFinite(old)&&old>current?Math.round(old*100):null;
 const badge=[raw.badge?.badgeMessage,raw.badge?.badgeType,raw.badge?.squareBadge].filter(Boolean).join(' '),newStatus=/\bnew\b/i.test(badge);
 const images=(source.media?.images||[]).filter(g=>g.image?.url).map(g=>g.image.url),originalImages=(source.media?.images||[]).filter(g=>g.zoomImage?.url).map(g=>({thumbnail:g.image.url,url:g.zoomImage.url,width:Number(g.zoomImage.width),height:Number(g.zoomImage.height),selectedSku:sku,verifiedBy:'ASDA exact-SKU zoomImage'}));
 const variantImageUrl=images[0]||previous?.variantImageUrl;
 const p={...previous,retailerId:'asda',retailerName:'ASDA · George',recordType:raw.productSetProduct?'product-set':raw.productType==='master'?'product-family':'sku',priceFrom:raw.price?.type==='range',sku,sourceUrl:url,variantName:raw.name||source.name,brand:source.brand||raw.brand||'George',priceGBP:current,price:Math.round(current*100),originalPrice:original,promoText:text(raw.savingsBadge?.savingsDisplayValue||''),newStatus,everNew:previous?.everNew||newStatus,observedAt,inStock:raw.productAvailable===true&&!raw.badgesInformation?.availableSoonBadgeInformation?.displayAvailableSoonBadge,variantImageUrl,listingVariantImageUrl:raw.media?.images?.[0]?.image?.url,imageUrl:variantImageUrl,images,originalImages,asdaSource:{primaryCategoryID:source.primaryCategoryID||raw.primaryCategoryID,customType:raw.customType,sourceBadge:raw.badge,savingsBadge:raw.savingsBadge},sourceColour:source.colour||raw.colour};
 if(originalImages[0])p.originalImageUrl=originalImages[0].url;
 if(!detail&&previous&&previous.detailInputFingerprint!==asdaFingerprint(p)){p.detailsReady=false;delete p.detailEvidence;p.attributeObservedAt=null;}
 if(!detail&&previous?.detailsReady&&previous.detailInputFingerprint===asdaFingerprint(p)){p.variantImageUrl=previous.variantImageUrl;p.images=previous.images;p.originalImages=previous.originalImages;p.originalImageUrl=previous.originalImageUrl;}
 if(!baseline&&!previous&&p.inStock){p.firstNewObservedAt=observedAt;p.arrivalEvidence='observed-after-baseline';p.everNew=true;}
 if(detail){
  p.sourceDescription=text(detail.longDescription||detail.productDescriptionAttributes?.longDescription);p.productSummary=p.sourceDescription;
  const specifications=Object.fromEntries((detail.attributes||[]).filter(x=>x.value!==null&&x.value!==undefined&&String(x.value)!=='').map(x=>[x.key,String(x.value)]));
  const dimensions=specifications['Dimensions (WxDxH in cm)'];if(dimensions){const m=dimensions.match(/^\s*([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*cm\s*$/i);if(m){for(const [i,key]of ['Width','Depth','Height'].entries()){if(specifications[key]&&toCentimetres(specifications[key])!==Number(m[i+1]))specifications['Source '+key]=specifications[key];specifications[key]=m[i+1]+'cm';}}}
  p.specifications=specifications;p.dimensions=productDimensions(specifications,p.sourceDescription);p.material=materialFacts(specifications,p.sourceDescription).label;
  p.appearanceSource=descriptionFacts(p,specifications,p.sourceDescription);p.colorValues=normaliseColors(source.colour||specifications.Colour);p.treeColor=p.colorValues.join(' / ');p.heightCm=p.dimensions.values.Height||toCentimetres(specifications.Height);p.heightLabel=specifications.Height||null;
  p.attributeObservedAt=observedAt;p.detailsReady=true;p.detailEvidence={selectedSku:sku,verifiedProductSection:true,sourceUrl:url,observedAt,text:p.sourceDescription,sourceTransport:'ASDA-native-productData'};delete p.detailIssue;
 }
 const cls=asdaMemberships(p);p.department=cls.primary;p.departmentIds=cls.memberships;p.kind=cls.primary==='asda-tree'?'tree':'decoration';p.classificationEvidence=cls;p.detailInputFingerprint=asdaFingerprint(p);
 if(p.kind==='tree'){const t=p.variantName+' '+(p.sourceDescription||'');p.style=/\bpott?ed\b/i.test(t)?'圣诞树盆栽':/pop[ -]?up|collapsible/i.test(t)?'折叠式圣诞树':/slim|pencil/i.test(t)?'纤细圣诞树':/snow|flock/i.test(t)?'雪景款':/pre[ -]?lit/i.test(t)?'预亮灯款':/\b(?:twig|birch|cone)\b/i.test(t)?'其他树形类别':'标准款';}
 return p;
}
