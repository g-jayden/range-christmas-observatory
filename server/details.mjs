import {createHash} from 'node:crypto';
const decode=s=>String(s).replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
export function parseDetails(response,expectedSku,sourceUrl,observedAt=new Date().toISOString()){
 const data=response?.data;if(!response.success||data?.metadata?.statusCode!==200||!data.rawHtml||!data.markdown)throw Error('PDP did not return complete source content');
 const sku=data.rawHtml.match(/id=["']product-dyn-code["'][^>]*>\s*([^<]+)/i)?.[1]?.trim().replace(/^[PM]/i,'');
 if(sku!==String(expectedSku))throw Error('PDP selected SKU does not match requested SKU: '+expectedSku+' / '+(sku||'unknown'));
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
function cm(value){const m=String(value||'').match(/^\s*([\d.]+)\s*(cm|mm|m|ft|inches?|in)\b/i);if(!m)return null;return Number(m[1])*({cm:1,mm:.1,m:100,ft:30.48,in:2.54,inch:2.54,inches:2.54}[m[2].toLowerCase()]);}
export function applyDetails(p,d){
 const s=d.specs,t=d.featuresText,lower=t.toLowerCase();
 p.attributeObservedAt=d.observedAt;p.detailEvidence={url:d.sourceUrl,text:d.text,verifiedProductSection:true,selectedSku:d.sku,observedAt:d.observedAt};p.specifications=s;p.descriptionHash=d.contentHash;
 const originalHeight=s['Christmas Tree Height'],heightCm=cm(s.Height||s.Length);p.heightLabel=originalHeight||(heightCm?heightCm.toFixed(1)+'cm':'高度未确认');p.heightCm=heightCm;p.heightValues=originalHeight?[originalHeight]:[];
 p.treeColor=s.Colour||s.Color||'颜色未确认';p.colorValues=p.treeColor==='颜色未确认'?[]:[p.treeColor];p.material=s.Material||'材质未确认';
 p.skirtDiameterCm=cm(s.Diameter);p.skirtBaseDiameterCm=cm(s['Base Diameter']||s['Bottom Diameter']);p.skirtTopDiameterCm=cm(s['Top Diameter']);
 const f=p.features||{};
 f.snow=f.snow||/snow[ -](?:dusted|covered|flocked|effect|finished)|(?:snowy|frosted|flocked)(?:[ -](?:finished|white))? (?:branches|tips|tree|finish)/i.test(t);
 f.prelit=f.prelit||/pre[ -]?lit|built[ -]in.{0,35}lights|\b\d+ (?:RGB |warm white |white |multicolou?r |LED )*(?:LED )?lights\b/i.test(t);
 for(const [key,word]of [['pinecones',/pine ?cones?/i],['berries',/berr(?:y|ies)/i],['baubles',/baubles?/i]]){
  f[key]=null;for(const sentence of t.split(/(?<=[.!?])\s+|\n/)){if(word.test(sentence)&&!/(?:your (?:own )?|can be|can add|add your|not included|not supplied|decorate (?:it|the tree)|personalise|personalize|hang decorations|easy to hang|room for|dress up)/i.test(sentence)){f[key]=true;break}}
 }
 p.features=f;
 p.style=[['potted','圣诞树盆栽'],['popUp','折叠式圣诞树'],['slim','纤细圣诞树'],['snow','雪景款'],['prelit','预亮灯款']].find(([k])=>f[k])?.[1]||'标准／其他装饰待核验';
 if(/\barch\b|\btwig\b|\bbirch\b|\bwooden\b|\bpaper\b|\bcone tree\b|\bpyramid\b/i.test(p.variantName))p.style='其他树形／拱门装饰';
 else if(p.style==='标准／其他装饰待核验'){if(['pinecones','berries','baubles'].some(k=>f[k]))p.style='其他预装饰款';else if(/\bplain green\b|\bundecorated design\b|\bunadorned\b/.test(lower))p.style='标准款（介绍已核验）';}
 if(/placeholder/i.test(p.variantImageUrl||p.imageUrl||'')&&d.image){p.variantImageUrl=d.image;p.imageEvidence={url:d.image,source:d.sourceUrl,field:'selected SKU offer image / og:image',observedAt:d.observedAt}}
 p.images=[...new Set([p.variantImageUrl,p.imageUrl,...d.images].filter(u=>/^https:\/\//.test(u||'')))];
 return p;
}
