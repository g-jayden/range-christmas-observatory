import {ASDA_DEPARTMENTS,isAsdaScope} from './asda-model.mjs';
import {TAXONOMY_VERSION,productBody,offeredObject,objectMemberships,isPublishedProduct} from './taxonomy.mjs';
export {isPublishedProduct} from './taxonomy.mjs';
import {THEME_DEFINITIONS,isThemeScope} from './theme-model.mjs';
export {THEME_DEFINITIONS,isThemeScope} from './theme-model.mjs';
export const DEPARTMENTS=[...ASDA_DEPARTMENTS.map(d=>[d.id,d.zh,d.en]),
 ['tree','圣诞树','Christmas Trees'],['skirt','圣诞树裙','Christmas Tree Skirts'],
 ['ornaments','圣诞装饰品','Christmas Ornaments'],['standing','立式装饰品','Standing Decorations'],
 ['wreath','圣诞圈','Christmas Wreaths'],['garland','圣诞长藤','Christmas Garlands'],
 ['spray','圣诞单枝','Christmas Sprays / Picks / Branches / Bushes'],['candle-holder','圣诞烛台','Christmas Candle Holders'],
 ['swag','圣诞壁挂','Christmas Swags / Drops'],['scenes','圣诞场景与模型','Christmas Scenes & Models'],
 ['tree-decorations','圣诞树装饰','Tree Decorations'],['inflatable','充气圣诞装饰品','Inflatable Christmas Decorations'],
 ['outdoor','圣诞户外装饰品','Christmas Outdoor Decorations'],['wall','圣诞墙饰','Christmas Wall Decorations'],
 ['presents','礼品包','Christmas Presents'],
 ['lights','圣诞灯饰','Christmas Lights'],
 ['string-lights','圣诞彩灯','Christmas String Lighting','lights'],
 ['indoor-lights','室内圣诞灯饰','Indoor Christmas Lights','lights'],
 ['outdoor-lights','户外圣诞灯饰','Outdoor Christmas Lights','lights'],
 ['christmas-lanterns','圣诞灯笼','Christmas Lanterns','lights'],
 ['acrylic-lights','亚克力圣诞灯','Acrylic Christmas Lights','lights'],
 ['christmas-tree-lights','圣诞树彩灯','Christmas Tree Lights','lights'],
 ['themes','按主题分类','Christmas Themes'],
 ...THEME_DEFINITIONS.map(t=>[t.id,t.zh,t.en,'themes'])
].map(([id,zh,en,parentId])=>({id,zh,en,label:zh+' · '+en,...(parentId?{parentId}:{}),...((id==='lights'||id==='asda-lights'||parentId==='lights'||isThemeScope(id))?{charts:false}:{} )}));
export const DEPARTMENT_MAP=Object.fromEntries(DEPARTMENTS.map(d=>[d.id,d]));
export const ROOT_DEPARTMENTS=DEPARTMENTS.filter(d=>!d.parentId);
export const LIGHT_DEPARTMENTS=DEPARTMENTS.filter(d=>d.parentId==='lights');
export const isLightingScope=id=>id==='asda-lights'||id==='lights'||DEPARTMENT_MAP[id]?.parentId==='lights';
export const decorationDepartments=DEPARTMENTS.filter(d=>!isAsdaScope(d.id)&&!['tree','skirt'].includes(d.id)&&!isLightingScope(d.id)&&!isThemeScope(d.id));
// Prices come from the retailer's integer-pence fields, never historical changes.
export function sourcePrice(p){
 const current=Number.isFinite(p.priceGBP)?Math.round(p.priceGBP*100):Number.isInteger(p.price)?p.price:null;
 const original=Number.isInteger(p.originalPrice)?p.originalPrice:null;
 return {currentPence:current,originalPence:original,reduced:current!==null&&original!==null&&original>current,promoText:typeof p.promoText==='string'?p.promoText:null};
}
export const COLOUR_EN={'绿色':'Green','白色':'White / Cream','黑色':'Black','深空灰色':'Dark Charcoal Grey','灰色':'Grey','粉色':'Pink','红色':'Red / Burgundy','褐色':'Brown / Beige','金色':'Gold','银色':'Silver','蓝色':'Blue / Navy','青色':'Teal / Turquoise','紫色':'Purple','橙色':'Orange','黄色':'Yellow','透明色':'Clear','古铜色':'Bronze','铜色':'Copper','多色':'Multicolour','颜色待核验':'Colour unconfirmed','颜色未确认':'Colour unconfirmed'};
export const colourLabel=c=>c+' · '+(COLOUR_EN[c]||c);
export const STYLE_EN={'圣诞树盆栽':'Potted','折叠式圣诞树':'Pop-up','纤细圣诞树':'Slim','雪景款':'Snow / Flocked','预亮灯款':'Pre-lit','标准款':'Standard','其它树形类别':'Other tree shapes'};
export const FIELD_ZH={Height:'高度',Width:'宽度',Depth:'深度',Length:'长度',Diameter:'直径','Base Diameter':'底部直径','Bottom Diameter':'底部直径','Top Diameter':'顶部直径','Christmas Tree Height':'树高',Size:'尺寸',Dimensions:'尺寸',Max:'最大尺寸',Material:'材质','Material Composition':'材质组成',Colour:'颜色',Color:'颜色',Weight:'重量','Shipping Weight':'运输重量','Pack Size':'包装数量','Light Colour':'灯光颜色','Number of LEDs':'灯珠数量','Indoor/Outdoor':'使用场景','Power Source':'电源','Cable Length':'线缆长度',Occasion:'适用节日',Design:'设计',Shape:'形状',Finish:'表面处理',Type:'类型','Model Number':'型号','Assembly Required':'需要组装','Batteries Required':'电池要求',Waterproof:'防水',Fabric:'织物','IP Rating':'防护等级','Decoration Type':'装饰类型','Mains Operated':'市电供电','Batteries Included':'是否包含电池',Voltage:'电压',Wattage:'功率',Timer:'定时器','Bulb Type':'灯泡类型','Power Type':'供电类型','Colour Temperature':'色温','Number of Bulbs':'灯泡数量','Light Functions':'灯光模式'};
Object.assign(FIELD_ZH,{'Dimensions (WxDxH in cm)':'尺寸（宽×深×高，厘米）','Indoor / Outdoor':'室内／户外用途','Assembly Information':'组装说明','Assembly Required':'是否需要组装',Warranty:'保修期','Colour Family':'颜色系列',Gender:'适用系列',Sale:'促销标识','Source Height':'原站标注高度','Source Width':'原站标注宽度','Source Depth':'原站标注深度'});
export const fieldLabel=k=>(FIELD_ZH[k]||'原站属性')+' · '+k;
export function heightCategoryLabel(raw){const s=String(raw||'').trim();if(/^(?:less than|under|below)\s+\d/i.test(s))return '低于 '+s.replace(/^(?:less than|under|below)\s+/i,'')+' · '+s;if(/^(?:more than|over|above)\s+\d/i.test(s))return '高于 '+s.replace(/^(?:more than|over|above)\s+/i,'')+' · '+s;if(/^\d+(?:\.\d+)?\s*(?:ft|cm|m|in)?\s*(?:to|[-–])\s*\d/i.test(s))return '原站高度范围 · Source height range: '+s;return '';}
export function beijingDay(value=Date.now()){return new Date(new Date(value).getTime()+28800000).toISOString().slice(0,10)}
export function isToday(p,now=Date.now()){return p.arrivalEvidence==='observed-after-baseline'&&Boolean(p.firstNewObservedAt)&&beijingDay(p.firstNewObservedAt)===beijingDay(now)}
export function isNew(p){return p.newStatus===true||Boolean(p.firstNewObservedAt&&p.arrivalEvidence==='observed-after-baseline')}
export function inDepartment(p,id){return isPublishedProduct(p)&&(p.taxonomyAudit?.version===TAXONOMY_VERSION?p.taxonomyAudit.memberships.includes(id):p.kind===id||p.department===id||(p.departmentIds||[]).includes(id))}
export function scopeProducts(products,id,mode='all',now=Date.now()){return products.filter(p=>inDepartment(p,id)&&(mode==='all'||(mode==='new'?isNew(p):isToday(p,now))))}
export function availableProducts(source,arrivals={}){
 const rows=new Map((source?.products||[]).map(p=>[p.sku,p]));
 const sourceAt=Date.parse(source?.observedAt)||0,arrivalAt=Date.parse(arrivals.observedAt)||0;
 const live=arrivalAt>=sourceAt&&Array.isArray(arrivals.availableSkus)?new Set(arrivals.availableSkus):null;
 for(const p of arrivals.products||[]){const prior=rows.get(p.sku);if(prior)rows.set(p.sku,Date.parse(p.observedAt)>Date.parse(prior.observedAt)?{...prior,...p}:{...p,...prior});else if(live?.has(p.sku)||arrivalAt>=sourceAt)rows.set(p.sku,p);}
 return [...rows.values()].filter(p=>!live||live.has(p.sku));
}
const currentTaxonomy=p=>p.taxonomyAudit?.version===TAXONOMY_VERSION&&p.taxonomyAudit.title===productBody(p)&&p.taxonomyAudit.imageHash===(p.displayImage?.sha256||p.imageCacheEvidence?.sha256||null);
export function classifyDecoration(p){
 if(currentTaxonomy(p))return {id:p.taxonomyAudit.primary,method:'SKU-object-image-season-audit',reason:p.taxonomyAudit.objectReason,matched:p.taxonomyAudit.objectEvidence};
 const cls=offeredObject(p);return {...cls,matched:cls.evidence};
}
export function toCentimetres(value){
 const t=String(value||'').trim(),m=t.match(/^([\d.]+)\s*(cm|mm|met(?:er|re)s?|m|feet|foot|ft|inch(?:es)?|in|["′'])/i);
 if(!m)return null;const factor={cm:1,mm:.1,m:100,meter:100,meters:100,metre:100,metres:100,ft:30.48,feet:30.48,foot:30.48,in:2.54,inch:2.54,inches:2.54,'"':2.54,"'":30.48,'′':30.48}[m[2].toLowerCase()];return factor?Math.round(Number(m[1])*factor*1000)/1000:null;
}
export function productDimensions(specs={},description=''){
 const fields=['Height','Width','Depth','Length','Diameter','Base Diameter','Top Diameter'];const values={},evidence={};
 for(const key of fields){const n=toCentimetres(specs[key]||key==='Height'&&specs['Christmas Tree Height']);if(n>0){values[key]=n;evidence[key]={value:specs[key]||specs['Christmas Tree Height'],source:'SKU specification'};}}
 for(const key of fields)if(!values[key]){
  const re=new RegExp('\\b'+key+'\\s*(?:[:=]|of|is)?\\s*([0-9.]+\\s*(?:cm|mm|metres?|meters?|ft|feet|inches?|m)\\b)','i');const match=description.match(re);if(match){const n=toCentimetres(match[1]);if(n>0){values[key]=n;evidence[key]={value:match[0],source:'SKU description'};}}
 }
 if(!Object.keys(values).length){const match=String(specs.Dimensions||specs.Size||description).match(/\b([\d.]+)\s*[x×*]\s*([\d.]+)(?:\s*[x×*]\s*([\d.]+))?\s*(cm|mm|m|inches?|ft)\b/i);if(match){const n=Math.max(...match.slice(1,4).filter(Boolean).map(v=>toCentimetres(v+match[4])));if(n>0){values.Max=n;evidence.Max={value:match[0],source:specs.Dimensions||specs.Size?'SKU size specification':'SKU description',axisOrderUnknown:true};}}}
 const rawSize=String(specs.Size||specs.Dimensions||specs['Bed Size']||specs['Clothing Size']||'').trim();
 if(!Object.keys(values).length&&rawSize&&!/\b(?:lead|cable)\b/i.test(rawSize)){const measures=[...rawSize.matchAll(/([\d.]+)\s*(cm|mm|metres?|meters?|ft|feet|inches?|in|m)\b/ig)].map(m=>toCentimetres(m[1]+m[2])).filter(n=>n>0);if(measures.length){values.Max=Math.max(...measures);evidence.Max={value:rawSize,source:'SKU size specification',axisOrderUnknown:true};}}
 const axes=Object.entries(values).map(([key,cm])=>({key,cm,label:fieldLabel(key)})),max=axes.length?Math.max(...axes.map(a=>a.cm)):null;
 const names={'One Size':'均码','Small':'小号','Medium':'中号','Large':'大号','Single':'单人床','Double':'双人床','King':'加大床','Super King':'特大床','Adults':'成人','L/XL':'大号／加大号'};const categoryLabel=!axes.length&&rawSize?(names[rawSize]||'原站尺寸')+' · '+rawSize:null;
 return {values,axes,maxCm:max,evidence,sourceSize:rawSize||null,categoryLabel,label:axes.length?axes.map(a=>a.label+' '+a.cm+'cm').join(' × '):categoryLabel||'尺寸未注明 · Size not specified'};
}

// Compare only unambiguous whole-tree title heights. Ranges and multiple
// non-equivalent measurements cannot establish which axis the title means.
export function treeHeightConflict(p){
 if(p.taxonomyAudit?.primary?p.taxonomyAudit.primary!=='tree':p.kind!=='tree')return null;
 const title=String(p.variantName||p.name||''),unit='(?:cm|mm|metres?|meters?|ft|feet|inches?|in|m)';
 if(new RegExp('\\d[\\d.]*\\s*(?:'+unit+')?\\s*[x×*]\\s*\\d','i').test(title))return null;
 const readings=[...title.matchAll(new RegExp('(\\d+(?:\\.\\d+)?)\\s*('+unit+')(?![a-z])','ig'))].map(m=>toCentimetres(m[1]+m[2]));
 if(!readings.length||readings.some(n=>!(n>0))||readings.some(n=>Math.abs(n-readings[0])>Math.max(2,readings[0]*.05)))return null;
 const titleCm=readings[0],s=p.specifications||{},sourceValue=s.Height||s['Christmas Tree Height']||p.heightLabel,sourceCm=toCentimetres(sourceValue)||p.heightCm||p.dimensions?.values?.Height;
 if(!(sourceCm>0)||Math.abs(sourceCm-titleCm)<=Math.max(5,titleCm*.12))return null;
 const length=toCentimetres(s.Length)||p.dimensions?.values?.Length,agrees=length>0&&Math.abs(length-titleCm)<=Math.max(2,titleCm*.02);
 return {titleHeightCm:titleCm,sourceHeightCm:sourceCm,sourceValue:String(sourceValue||sourceCm+'cm'),titleEvidence:title,sourceUrl:p.sourceUrl,verifiedAt:p.attributeObservedAt,resolution:agrees?'title-and-length-agree':'unresolved',usableHeightCm:agrees?titleCm:null};
}

export function decorationMemberships(p,primary=classifyDecoration(p).id){
 if(currentTaxonomy(p))return p.taxonomyAudit.memberships;
 return objectMemberships(p,{...offeredObject(p),id:primary});
}
