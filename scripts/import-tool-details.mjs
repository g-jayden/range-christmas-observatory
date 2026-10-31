import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {applyDetails} from '../server/details.mjs';
import {atomicJson} from '../server/sync.mjs';
const catalogue=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));
const details=new Map();
for(const file of await fs.readdir('runtime/tool-details')){
  if(file==='issues.json')continue;
  for(const d of JSON.parse(await fs.readFile('runtime/tool-details/'+file,'utf8')))details.set(d.sku,d);
}
let verified=0;const issues=[];
for(const p of catalogue.products){
  const d=details.get(p.sku);
  if(d){
    d.contentHash=createHash('sha256').update(d.text).digest('hex');
    applyDetails(p,d);p.detailStatus='本轮具体SKU规格已核验';p.detailCheckedAt=d.observedAt;p.providerScrapeId=d.providerScrapeId;verified++;
  }else{
    p.previousAttributeEvidence={height:p.heightLabel,colour:p.treeColor,observedAt:p.attributeObservedAt};
    p.heightLabel='高度未确认';p.heightCm=null;p.heightValues=[];p.treeColor='颜色未确认';p.colorValues=[];p.material='材质未确认';p.attributeObservedAt=null;
    delete p.detailEvidence;delete p.specifications;
    p.style=[['potted','圣诞树盆栽'],['popUp','折叠式圣诞树'],['slim','纤细圣诞树'],['snow','雪景款'],['prelit','预亮灯款']].find(([key])=>p.features[key])?.[1]||'标准／其他装饰待核验';
    if(/\barch\b|\btwig\b|\bbirch\b|\bwooden\b|\bpaper\b|\bcone tree\b|\bpyramid\b/i.test(p.variantName))p.style='其他树形／拱门装饰';
    p.detailStatus='本轮具体SKU规格核验未通过';
    issues.push({sku:p.sku,name:p.variantName,url:p.sourceUrl,reason:/[\u0000-\u001f]/.test(p.sourceUrl)?'原站目录URL含无效控制字符，详情页面不可读取':'商品页返回同系列其他SKU，未采用其规格'});
  }
}
catalogue.detailsAudit={mode:'all-SKU-pages-attempted',checked:catalogue.products.length,verified,issues,completedAt:new Date().toISOString()};
catalogue.updatedAt=new Date().toISOString();
catalogue.revision=createHash('sha256').update(JSON.stringify(catalogue)).digest('hex');
await atomicJson('web/catalogue.json',catalogue);
const status=JSON.parse(await fs.readFile('web/status.json','utf8'));
Object.assign(status,{revision:catalogue.revision,mode:'full',detailsAudit:catalogue.detailsAudit,completedAt:catalogue.updatedAt});
await atomicJson('web/status.json',status);
console.log(JSON.stringify({stats:catalogue.stats,verified,issues:issues.length,unknownHeight:catalogue.products.filter(p=>p.kind==='tree'&&p.heightLabel==='高度未确认').length,unknownColour:catalogue.products.filter(p=>p.treeColor==='颜色未确认').length,unknownStyle:catalogue.products.filter(p=>p.kind==='tree'&&p.style==='标准／其他装饰待核验').length,skirtDiameterKnown:catalogue.products.filter(p=>p.kind==='skirt'&&(p.skirtDiameterCm||p.skirtBaseDiameterCm)).length}));
