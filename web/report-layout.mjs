import {DEPARTMENTS,DEPARTMENT_MAP} from './catalogue-model.mjs';
import {productKey,productRetailer,reportRetailer} from './product-facts.mjs';

export const REPORT_PAGE={width:595.28,height:841.89,margin:24,header:36,columns:2,rows:4,gap:16,caption:38};
export function reportPages(products){
 const groups=new Map(),seen=new Set(),physical=['tree','trees','skirt','skirt-stand','baubles','tree-decorations','topper','wreath','garland'],retailers=['the-range','asda','ms','bm','hb','du','nx','jl','mt','bq','ar'],order=new Map(DEPARTMENTS.map((d,i)=>[d.id,i]));
 const categoryRank=id=>{const name=id.replace(/^(?:asda|ms|bm|hb|du|nx|jl|mt|bq|ar)-/,'');const at=physical.indexOf(name);return at<0?100+(order.get(id)??999):at;};
 for(const p of products){const key=productKey(p);if(seen.has(key))continue;seen.add(key);const department=p.department||p.kind,group=productRetailer(p)+'/'+department;
  if(!groups.has(group))groups.set(group,{retailer:productRetailer(p),department,title:reportRetailer(p)+' · '+(DEPARTMENT_MAP[department]?.label||department),products:[]});groups.get(group).products.push(p);
 }
 const pages=[];
 for(const g of [...groups.values()].sort((a,b)=>(retailers.indexOf(a.retailer)<0?999:retailers.indexOf(a.retailer))-(retailers.indexOf(b.retailer)<0?999:retailers.indexOf(b.retailer))||a.retailer.localeCompare(b.retailer)||categoryRank(a.department)-categoryRank(b.department)))for(let i=0;i<g.products.length;i+=8)pages.push({...g,products:g.products.slice(i,i+8)});
 return pages;
}
export function reportCells(){const p=REPORT_PAGE,w=(p.width-p.margin*2-p.gap)/2,h=(p.height-p.margin*2-p.header-p.gap*3)/4;return Array.from({length:8},(_,i)=>({x:p.margin+i%2*(w+p.gap),top:p.margin+p.header+Math.floor(i/2)*(h+p.gap),width:w,height:h,imageHeight:h-p.caption,captionHeight:p.caption}));}

export function wrapReportText(value,width,measure){const lines=[];for(const part of String(value).split('\n')){let line='';for(let token of part.match(/\S+|\s+/g)||[]){if(line&&measure(line+token)>width){lines.push(line.trimEnd());line='';}if(!line)token=token.trimStart();while(token&&measure(token)>width){let cut=1;while(cut<token.length&&measure(token.slice(0,cut+1))<=width)cut++;lines.push(token.slice(0,cut));token=token.slice(cut);}line+=token;}if(line.trim())lines.push(line.trimEnd());}return lines;}
