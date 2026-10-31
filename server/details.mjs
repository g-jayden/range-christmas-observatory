import {createHash} from 'node:crypto';
const decode=s=>String(s).replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
export function parseDetails(response,expectedSku,sourceUrl,observedAt=new Date().toISOString()){
 if(response?.data?.sourceVariant)return parseVariantDetails(response,expectedSku,sourceUrl,observedAt);
 const data=response?.data;if(!response.success||data?.metadata?.statusCode!==200||!data.rawHtml||!data.markdown)throw Error('PDP did not return complete source content');
 const sku=data.rawHtml.match(/id=["']product-dyn-code["'][^>]*>\s*([^<]+)/i)?.[1]?.trim().replace(/^[PM]/i,'');
 if(String(sku).replace(/^0+(?=\d)/,'')!==String(expectedSku).replace(/^0+(?=\d)/,''))throw Error('PDP selected SKU does not match requested SKU: '+expectedSku+' / '+(sku||'unknown'));
 const start=data.markdown.indexOf('## Features'),specIndex=data.markdown.indexOf('## Specification');
 if(start<0||specIndex<start)throw Error('PDP feature/specification sections missing for '+expectedSku);
 const end=data.markdown.indexOf('Additional Information',specIndex),section=data.markdown.slice(start,end<0?specIndex+10000:end);
 const specs={};for(const m of section.slice(section.indexOf('## Specification')).matchAll(/^[-*]\s+([^:\n]+):\s*(.+)$/gm))specs[m[1].trim()]=m[2].trim();
 let product;for(const script of data.rawHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const j=JSON.parse(script[1]);if(j['@type']==='Product')product=j}catch{}}
 const offers=product?.offers?.offers||[product?.offers];const offer=offers.find(x=>String(x?.sku)===String(expectedSku));
 const image=offer?.image?.url||data.metadata['og:image']||data.metadata.ogImage;
 const gallery=product?.image?.url;const images=Array.isArray(gallery)?gallery:gallery?[gallery]:[];
 return {sku:String(expectedSku),sourceUrl,observedAt,specs,text:section,featuresText:section.slice(0,section.indexOf('## Specification')),image:image?decode(image):null,images:images.map(decode),offer:offer||null,contentHash:createHash('sha256').update(section).digest('hex')};
}
export function parseVariantDetails(response,expectedSku,sourceUrl,observedAt=new Date().toISOString()){
 const data=response.data,v=data.sourceVariant,f=data.familyEvidence;
 if(!response.success||data.metadata?.statusCode!==200||String(v.sku)!==String(expectedSku)||String(v.code).replace(/^0+(?=\d)/,'')!==String(expectedSku).replace(/^0+(?=\d)/,''))throw Error('Official variant SKU does not match requested SKU: '+expectedSku);
 const requested=new URL(sourceUrl),family=new URL(f.url),json=new URL(f.jsonUrl);
 if(requested.origin!==family.origin||requested.pathname.replace(/\/$/,'')!==family.pathname.replace(/\/$/,'')||json.origin!==family.origin||json.pathname!==family.pathname||!json.searchParams.has('json'))throw Error('Variant family source path does not match requested product');
 if(String(v.prod_id)!==String(f.productId))throw Error('Variant product family ID does not match product page');
 const specs={};for(const entry of v.product_specification||[]){const m=String(entry).match(/^([^:]+):\s*(.*)$/);if(m)specs[m[1].trim()]=m[2].trim();}
 for(let [key,value]of Object.entries(v.attributes||{})){if(key==='_swatch')key='Colour';if(!key.startsWith('_')&&value!=null)specs[key]=String(value);}
 if(v.attributes_supplementary?.['Model Number'])specs['Model Number']=String(v.attributes_supplementary['Model Number']);
 const features=[...f.features,...(v.features||[])],information=[v.desc_override===1?'':f.information,v.descriptionText||''].filter(Boolean).join('\n');
 const featuresText='## Features\n'+features.map(x=>'- '+x).join('\n')+'\n\n## Information\n'+information;
 const text=featuresText+'\n\n## Specification\n'+Object.entries(specs).map(([k,value])=>'- '+k+': '+value).join('\n');
 const image=f.offers.find(o=>String(o.sku)===String(expectedSku))?.image||null;
 const images=f.gallery.filter(g=>!g.variants.length||g.variants.includes(String(v.id))).map(g=>g.url);
 return {sku:String(expectedSku),sourceUrl,observedAt,specs,text,featuresText,image,images,verificationMethod:'official-variant-json-and-product-page',jsonSource:f.jsonUrl,contentHash:createHash('sha256').update(text).digest('hex')};
}
function cm(value){const m=String(value||'').match(/^\s*([\d.]+)\s*(cm|mm|m|ft|inches?|in)\b/i);if(!m)return null;return Number(m[1])*({cm:1,mm:.1,m:100,ft:30.48,in:2.54,inch:2.54,inches:2.54}[m[2].toLowerCase()]);}
export function productInformation(product,specs){
 const names={'Christmas Tree Height':'标称树高',Height:'高度',Width:'宽度',Depth:'深度',Length:'长度',Diameter:'直径','Base Diameter':'底部直径','Bottom Diameter':'底部直径','Top Diameter':'顶部直径',Weight:'重量','Shipping Weight':'运输重量',Material:'材质','Material Composition':'材质组成',Colour:'颜色',Color:'颜色','Tip Count':'枝尖数量','Number of LEDs':'灯珠数量','Light Colour':'灯光颜色','Branch Construction':'枝条结构','Fire Retardant':'阻燃属性','Pack Size':'包装数量','Model Number':'型号','Cable Length':'线缆长度','Batteries Required':'电池要求','Indoor/Outdoor':'使用场景',Occasion:'适用节日',Shape:'形状',Finish:'表面效果',Fabric:'面料',Size:'尺寸',Design:'图案',Type:'类型',Waterproof:'防水属性',Capacity:'容量','Assembly Required':'组装要求','Machine Washable':'可否机洗','Power Source':'电源类型','Power Type':'电源类型'};
 const specifications=Object.fromEntries(Object.entries(specs).filter(([key,value])=>names[key]&&String(value).length<=180));
 const highlights=['Christmas Tree Height','Diameter','Base Diameter','Colour','Color','Material','Tip Count','Number of LEDs','Light Colour'].filter(key=>specifications[key]).map(key=>names[key]+'：'+specifications[key]);
 const summary=[Number.isFinite(product.priceGBP)?'本次售价 £'+product.priceGBP.toFixed(2):'',...highlights].filter(Boolean).join('；')+'。';
 const text='商品概览\n'+summary+'\n\n商品规格\n'+Object.entries(specifications).map(([key,value])=>names[key]+'：'+value).join('\n')+'\n\n完整介绍请查看原站购买页。';
 return {specifications,summary,text};
}
export function applyDetails(p,d){
 const s=d.specs,t=d.featuresText,lower=t.toLowerCase();
 const info=productInformation(p,s);
 p.attributeObservedAt=d.observedAt;p.detailEvidence={url:d.sourceUrl,text:info.text,sourceContentHash:d.contentHash,verifiedProductSection:true,selectedSku:d.sku,observedAt:d.observedAt,verificationMethod:d.verificationMethod||'selected-SKU-DOM',jsonSource:d.jsonSource};p.productSummary=info.summary;p.specifications=info.specifications;p.descriptionHash=d.contentHash;
 const originalHeight=s['Christmas Tree Height'],heightCm=cm(s.Height)||cm(originalHeight);p.heightLabel=originalHeight||(heightCm?heightCm.toFixed(1)+'cm':'高度未确认');p.heightCm=heightCm;p.heightValues=originalHeight?[originalHeight]:[];
 p.treeColor=s.Colour||s.Color||'颜色未确认';p.colorValues=p.treeColor==='颜色未确认'?[]:[p.treeColor];p.material=s.Material||'材质未确认';
 p.skirtDiameterCm=cm(s.Diameter);p.skirtBaseDiameterCm=cm(s['Base Diameter']||s['Bottom Diameter']);p.skirtTopDiameterCm=cm(s['Top Diameter']);
 const f=p.features||{};
 f.snow=f.snow||/snow[ -](?:dusted|covered|flocked|effect|finished)|(?:snowy|frosted|flocked)(?:[ -](?:finished|white))? (?:branches|tips|tree|finish)/i.test(t);
 f.prelit=f.prelit||/pre[ -]?lit|built[ -]in.{0,35}lights|\b\d+ (?:RGB |warm white |white |multicolou?r |LED )*(?:LED )?lights\b/i.test(t);
 for(const [key,word]of [['pinecones',/pine ?cones?/i],['berries',/berr(?:y|ies)/i],['baubles',/baubles?/i]]){
  f[key]=null;for(const sentence of t.split(/(?<=[.!?])\s+|\n/)){if(word.test(sentence)&&!/(?:your (?:own )?|can be|can add|add your|not included|not supplied|decorate (?:it|the tree)|personalise|personalize|hang decorations|easy to hang|room for|dress up)/i.test(sentence)){f[key]=true;break}}
 }
 if(/\bnon[ -]flocked\b/i.test(s.Design||p.variantName))f.snow=false;
 p.features=f;
 p.style=[['potted','圣诞树盆栽'],['popUp','折叠式圣诞树'],['slim','纤细圣诞树'],['snow','雪景款'],['prelit','预亮灯款']].find(([k])=>f[k])?.[1]||'标准／其他装饰待核验';
 if(/\barch\b|\btwig\b|\bbirch\b|\bwooden\b|\bpaper\b|\bcone tree\b|\bpyramid\b/i.test(p.variantName))p.style='其他树形／拱门装饰';
 else if(p.style==='标准／其他装饰待核验'){if(['pinecones','berries','baubles'].some(k=>f[k]))p.style='其他预装饰款';else if(/\bplain green\b|\bundecorated design\b|\bunadorned\b/.test(lower))p.style='标准款（介绍已核验）';}
 if(/placeholder/i.test(p.variantImageUrl||p.imageUrl||'')&&d.image){p.variantImageUrl=d.image;p.imageEvidence={url:d.image,source:d.sourceUrl,field:'selected SKU offer image / og:image',observedAt:d.observedAt}}
 p.images=[...new Set([p.variantImageUrl,p.imageUrl,...d.images].filter(u=>/^https:\/\//.test(u||'')))];
 return p;
}
