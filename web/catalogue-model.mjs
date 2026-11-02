export const DEPARTMENTS=[
 ['tree','圣诞树','Christmas Trees'],['skirt','圣诞树裙','Christmas Tree Skirts'],
 ['ornaments','圣诞装饰品','Christmas Ornaments'],['standing','立式装饰品','Standing Decorations'],
 ['wreath','圣诞圈','Christmas Wreaths'],['garland','圣诞长藤','Christmas Garlands'],
 ['spray','圣诞单枝','Christmas Sprays / Picks / Branches / Bushes'],['candle-holder','圣诞烛台','Christmas Candle Holders'],
 ['swag','圣诞壁挂','Christmas Swags / Drops'],['scenes','圣诞场景与模型','Christmas Scenes & Models'],
 ['tree-decorations','圣诞树装饰','Tree Decorations'],['inflatable','充气圣诞装饰品','Inflatable Christmas Decorations'],
 ['outdoor','圣诞户外装饰品','Christmas Outdoor Decorations'],['wall','圣诞墙饰','Christmas Wall Decorations']
].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en}));
export const DEPARTMENT_MAP=Object.fromEntries(DEPARTMENTS.map(d=>[d.id,d]));
export const decorationDepartments=DEPARTMENTS.filter(d=>!['tree','skirt'].includes(d.id));
export const COLOUR_EN={'绿色':'Green','白色':'White / Cream','黑色':'Black','深空灰色':'Dark Charcoal Grey','灰色':'Grey','粉色':'Pink','红色':'Red / Burgundy','褐色':'Brown / Beige','金色':'Gold','银色':'Silver','蓝色':'Blue / Navy','青色':'Teal / Turquoise','紫色':'Purple','橙色':'Orange','黄色':'Yellow','透明色':'Clear','古铜色':'Bronze','多色':'Multicolour','颜色待核验':'Colour unconfirmed','颜色未确认':'Colour unconfirmed'};
export const colourLabel=c=>c+' · '+(COLOUR_EN[c]||c);
export const STYLE_EN={'圣诞树盆栽':'Potted','折叠式圣诞树':'Pop-up','纤细圣诞树':'Slim','雪景款':'Snow / Flocked','预亮灯款':'Pre-lit','标准款':'Standard','其它树形类别':'Other tree shapes'};
export const FIELD_ZH={Height:'高度',Width:'宽度',Depth:'深度',Length:'长度',Diameter:'直径','Base Diameter':'底部直径','Bottom Diameter':'底部直径','Top Diameter':'顶部直径','Christmas Tree Height':'树高',Size:'尺寸',Dimensions:'尺寸',Max:'最大尺寸',Material:'材质','Material Composition':'材质组成',Colour:'颜色',Color:'颜色',Weight:'重量','Shipping Weight':'运输重量','Pack Size':'包装数量','Light Colour':'灯光颜色','Number of LEDs':'灯珠数量','Indoor/Outdoor':'使用场景','Power Source':'电源','Cable Length':'线缆长度',Occasion:'适用节日',Design:'设计',Shape:'形状',Finish:'表面处理',Type:'类型','Model Number':'型号','Assembly Required':'需要组装','Batteries Required':'电池要求',Waterproof:'防水',Fabric:'织物'};
export const fieldLabel=k=>(FIELD_ZH[k]||'原站属性')+' · '+k;
export function beijingDay(value=Date.now()){return new Date(new Date(value).getTime()+28800000).toISOString().slice(0,10)}
export function isToday(p,now=Date.now()){return p.arrivalEvidence==='observed-after-baseline'&&Boolean(p.firstNewObservedAt)&&beijingDay(p.firstNewObservedAt)===beijingDay(now)}
export function isNew(p){return p.newStatus===true||Boolean(p.firstNewObservedAt&&p.arrivalEvidence==='observed-after-baseline')}
export function inDepartment(p,id){return p.kind===id||p.department===id||(p.departmentIds||[]).includes(id)}
export function scopeProducts(products,id,mode='all',now=Date.now()){return products.filter(p=>inDepartment(p,id)&&(mode==='all'||(mode==='new'?isNew(p):isToday(p,now))))}
export function classifyDecoration(p){
 const title=String(p.variantName||p.name||''),description=p.appearanceSource?.descriptionText||p.sourceDescription||'',text=title+' '+description;
 // Product type in its title takes precedence over examples of where it can be used.
 const rules=[
  ['inflatable',/\binflatabl[ea]\b/i],
  ['candle-holder',/\b(?:candle[ -]?(?:holder|stick|stand|bridge)s?|candelabra|tea[ -]?light[ -]?(?:holder|lantern)s?)\b/i],
  ['swag',/\b(?:swags?|tear[ -]?drops?)\b/i],
  ['wreath',/\bwreaths?\b/i],['garland',/\b(?:garlands?|mantel[ -]?piece (?:foliage|decoration))\b/i],
  ['spray',/\b(?:picks?|sprays?|stems?|branches|branch|bush(?:es)?|sprigs?)\b/i],
  ['scenes',/\b(?:nativity|village|scene|diorama|miniature (?:house|church|shop|model)|snow[ -]?globes?|water[ -]?spinner|model (?:train|house|church))\b/i],
  ['wall',/\b(?:wall[ -]?(?:art|decor|decoration|hanging|sticker|mounted)|window (?:sticker|cling|decal)|door (?:sign|plaque)|hanging (?:sign|plaque)|window and wall)\b/i],
  ['tree-decorations',/\b(?:baubles?|tree (?:decoration|ornament|topper|pendant)|hanging (?:ornament|decoration)|tinsel|christmas tree (?:bow|ribbon|star)|shatterproof)\b/i],
  ['standing',/\b(?:standing|stand[ -]?up|nutcracker|gonks?|gnomes?|santa|snowman|penguin|reindeer|polar bear|figurine|figure|elf|elves|soldier)\b/i],
  ['outdoor',/\b(?:outdoor|garden|lawn|pathway|porch|weather[ -]?proof)\b/i]
 ];
 for(const [id,re]of rules){
  if(id==='spray'&&/\b(?:snow spray|spray (?:paint|snow)|bauble|candle|tinsel)\b/i.test(title))continue;
  if(re.test(title))return {id,method:'product-title',matched:title};
 }
 const breadcrumb=(p.detailEvidence?.breadcrumbs||[]).join(' ');
 for(const [id,re]of rules)if(re.test(breadcrumb))return {id,method:'official-breadcrumb',matched:breadcrumb};
 // Only explicit descriptions of this object's type, not recommended companion items.
 const lead=text.slice(title.length,title.length+450);
 for(const [id,re]of rules)if(re.test(lead)&&/\b(?:this|the|our)\s+(?:[\w-]+\s+){0,5}(?:wreath|garland|swag|pick|spray|candle holder|inflatable|scene|figurine)\b/i.test(lead))return {id,method:'product-description',matched:lead};
 return {id:'ornaments',method:'root-decoration-catalogue',matched:'Official Christmas Decorations catalogue; no more specific supported product type'};
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
 const axes=Object.entries(values).map(([key,cm])=>({key,cm,label:fieldLabel(key)})),max=axes.length?Math.max(...axes.map(a=>a.cm)):null;
 return {values,axes,maxCm:max,evidence,label:axes.length?axes.map(a=>a.label+' '+a.cm+'cm').join(' × '):'尺寸未注明 · Size not specified'};
}
