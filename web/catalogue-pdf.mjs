import {REPORT_PAGE,reportPages,reportCells} from './report-layout.mjs';
import {productPrice,productSize} from './product-facts.mjs';
import {productNames} from './product-names.mjs';
const bytes=s=>new TextEncoder().encode(s);
const join=chunks=>{const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;};
// Native JPEG bytes are embedded unchanged. Other formats are losslessly
// decoded to RGB and deflated by the host adapter; no resampling or upscaling.
export async function cataloguePdf(products,{image,text,onProgress=()=>{},parts=false,productNames:readNames=productNames,productPrice:readPrice=productPrice,productSize:readSize=productSize}){
 const pages=reportPages(products);if(!pages.length)throw Error('没有可导出的商品 · No products to export');
 const objects=[null,null],pageIds=[],cells=reportCells();let done=0;
 const add=content=>(objects.push(content),objects.length);
 const stream=(dict,data)=>[bytes('<< '+dict+' /Length '+data.length+' >>\nstream\n'),data,bytes('\nendstream')];
 const embed=img=>{if(!(img.width>0&&img.height>0)||!['DCTDecode','FlateDecode'].includes(img.filter))throw Error('Invalid native PDF image');return add(stream('/Type /XObject /Subtype /Image /Width '+img.width+' /Height '+img.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /'+img.filter,img.bytes));};
 for(const page of pages){const resources=[],commands=[];
  const draw=(id,x,top,w,h)=>{const name='Im'+resources.length;resources.push('/'+name+' '+id+' 0 R');commands.push('q '+[w,0,0,h,x,REPORT_PAGE.height-top-h].map(n=>Number(n.toFixed(3))).join(' ')+' cm /'+name+' Do Q');};
  const heading=await text(page.title,1600,100,38);draw(embed(heading),REPORT_PAGE.margin,REPORT_PAGE.margin,REPORT_PAGE.width-REPORT_PAGE.margin*2,30);
  for(let i=0;i<page.products.length;i++){const p=page.products[i],c=cells[i],original=await image(p),ratio=Math.min(c.width/original.width,c.imageHeight/original.height),w=original.width*ratio,h=original.height*ratio;draw(embed(original),c.x+(c.width-w)/2,c.top+(c.imageHeight-h)/2,w,h);
   const names=readNames(p),caption=await text(names.zh+'\n'+names.en+'\n'+readPrice(p)+'\n'+readSize(p),1200,320,42);draw(embed(caption),c.x,c.top+c.imageHeight,c.width,c.captionHeight);onProgress(++done,products.length);
  }
  const content=add(stream('',bytes(commands.join('\n')))),id=add(bytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+REPORT_PAGE.width+' '+REPORT_PAGE.height+'] /Resources << /XObject << '+resources.join(' ')+' >> >> /Contents '+content+' 0 R >>'));pageIds.push(id);
 }
 objects[0]=bytes('<< /Type /Catalog /Pages 2 0 R >>');objects[1]=bytes('<< /Type /Pages /Count '+pageIds.length+' /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] >>');
 const chunks=[bytes('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')],offsets=[0];let offset=chunks[0].length;
 for(let i=0;i<objects.length;i++){offsets.push(offset);const objectParts=[bytes((i+1)+' 0 obj\n'),...(Array.isArray(objects[i])?objects[i]:[objects[i]]),bytes('\nendobj\n')];chunks.push(...objectParts);offset+=objectParts.reduce((n,b)=>n+b.length,0);}
 chunks.push(bytes('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF\n'));
 return parts?chunks:join(chunks);
}
