import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const HOME='https://g-jayden.github.io/range-christmas-observatory/';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function lines(text,width,font){const out=[];let line='',used=0;const units=String(text).match(/[A-Za-z0-9]+|[ \t]+|[\s\S]/g)||[];for(const unit of units){const size=[...unit].reduce((n,c)=>n+(/[\u0000-\u00ff]/.test(c)?.55:1),0);if((used+size)*font>width&&line){out.push(line.trimEnd());line='';used=0;}if(!line&&!unit.trim())continue;line+=unit;used+=size;}if(line)out.push(line.trimEnd());return out;}
async function renderer(){
 const dir=path.resolve('runtime/fonts');await fs.mkdir(dir,{recursive:true});const font=path.join(dir,'NotoSansCJKsc-Regular.otf');
 try{await fs.access(font)}catch{const r=await fetch('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('CJK font download failed');const b=Buffer.from(await r.arrayBuffer());if(b.length<1000000||b.subarray(0,4).toString()!=='OTTO')throw Error('Invalid CJK font');await fs.writeFile(font,b);}
 const config=path.join(dir,'fonts.conf');await fs.writeFile(config,`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${esc(dir)}</dir><cachedir>${esc(dir+'/cache')}</cachedir></fontconfig>`);process.env.FONTCONFIG_FILE=config;
 return (await import('sharp')).default;
}
export async function buildMailAssets(p,pdpBase64=null){
 if(!/^\d{1,12}$/.test(String(p.sku)))throw Error('Invalid card SKU');const sharp=await renderer();
 if(!p.originalCachedImageUrl||!p.originalImageUrl)throw Error('官网原图尚未核验，不能用缩略图代替原图');
 const originalPath='web/'+p.originalCachedImageUrl,original=await fs.readFile(originalPath),meta=await sharp(original).metadata();
 if(!meta.width||!meta.height||meta.width<64||meta.height<64)throw Error('Real original photo not available');
 const displayW=Math.min(meta.width,1800),displayH=Math.round(meta.height*displayW/meta.width),W=Math.max(960,displayW+100),left=(W-displayW)/2;
 const titleSize=Math.round(W*.039),bodySize=Math.round(W*.029),margin=50;let y=margin+titleSize;
 const text=[];for(const line of lines((p.kind==='tree'?'圣诞树：':'圣诞树裙：')+p.variantName,W-100,titleSize)){text.push(`<text x="50" y="${y}" font-size="${titleSize}" font-weight="bold">${esc(line)}</text>`);y+=titleSize*1.48;}
 const imageY=Math.round(y+15);y=imageY+displayH+bodySize*1.5;
 const info=[`SKU：${p.sku}`,`价格：£${Number(p.priceGBP).toFixed(2)}`,...(p.kind==='tree'?[`高度：${p.heightLabel||'高度未确认'}`]:[]),`本体颜色：${p.treeColor}`,...(p.kind==='tree'?[`分类：${p.style}`]:[`材质：${p.material}`])];
 for(const item of info)for(const line of lines(item,W-100,bodySize)){text.push(`<text x="50" y="${y}" font-size="${bodySize}">${esc(line)}</text>`);y+=bodySize*1.7;}
 y+=25;const noteSize=Math.round(bodySize*.65),notes=[`官网原图：${meta.width} × ${meta.height} 像素；原文件未经放大或二次压缩`,`价格／NEW 核验：${p.newEvidence?.observedAt||p.observedAt?new Date(p.newEvidence?.observedAt||p.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'见商品证据'}（北京时间）`,'完整信息卡与官网原图，可使用邮件中的下载按钮分别保存。'];
 for(const item of notes)for(const line of lines(item,W-100,noteSize)){text.push(`<text x="50" y="${y}" font-size="${noteSize}" fill="#5c6b63">${esc(line)}</text>`);y+=noteSize*1.6;}
 const H=Math.ceil(y+40),imageUri='data:'+({'jpeg':'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif'}[meta.format]||'image/jpeg')+';base64,'+original.toString('base64');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/><g font-family="Noto Sans CJK SC" fill="#173c32">${text.join('')}</g><image x="${left}" y="${imageY}" width="${displayW}" height="${displayH}" xlink:href="${imageUri}"/></svg>`;
 const dir='web/mail-assets/'+p.sku;await fs.mkdir(dir,{recursive:true});const card=await sharp(Buffer.from(svg)).png({compressionLevel:9}).toBuffer();await fs.writeFile(dir+'/card.png',card);
 const ext=meta.format==='jpeg'?'jpg':meta.format;await fs.writeFile(dir+'/original.'+ext,original);let combined=card;
 if(pdpBase64){const pdp=Buffer.from(pdpBase64,'base64'),pm=await sharp(pdp).metadata(),pw=Math.min(pm.width,W),ph=Math.round(pm.height*pw/pm.width),proof=await sharp(pdp).resize({width:pw,withoutEnlargement:true}).png().toBuffer();await fs.writeFile(dir+'/proof.png',pdp);
  const divider=Buffer.from(`<svg width="${W}" height="110"><rect width="100%" height="100%" fill="#edf2ed"/><text x="50" y="75" font-family="Noto Sans CJK SC" font-size="38" fill="#173c32">以下为同一 SKU 的原站商品页真实截图</text></svg>`);
  combined=await sharp({create:{width:W,height:H+110+ph,channels:3,background:'white'}}).composite([{input:card,left:0,top:0},{input:divider,left:0,top:H},{input:proof,left:Math.floor((W-pw)/2),top:H+110}]).png({compressionLevel:9}).toBuffer();
 }
 await fs.writeFile(dir+'/notification.png',combined);const prefix=HOME+'mail-assets/'+p.sku+'/';
 const manifest={version:1,sku:String(p.sku),name:p.variantName,priceGBP:p.priceGBP,colors:p.colorValues,style:p.style,material:p.material,height:p.heightLabel,sourceUrl:p.sourceUrl,observedAt:p.newEvidence?.observedAt||p.observedAt,card:{url:prefix+'card.png',width:W,height:H,bytes:card.length},original:{url:prefix+'original.'+ext,sourceUrl:p.originalImageUrl||p.imageCacheEvidence?.sourceUrl,width:meta.width,height:meta.height,sha256:createHash('sha256').update(original).digest('hex'),bytes:original.length,upscaled:false,recompressed:false},proof:pdpBase64?{url:prefix+'proof.png',kind:'selected-SKU-official-page-screenshot'}:null,notification:{url:prefix+'notification.png',kind:pdpBase64?'information-card-plus-official-page-screenshot':'information-card-only-test',bytes:combined.length}};
 await fs.writeFile(dir+'/manifest.json',JSON.stringify(manifest));p.mailAssets=manifest;
 return {manifest,downloadUrl:HOME+'product.html?sku='+p.sku,attachmentBase64:combined.length<=5000000?combined.toString('base64'):pdpBase64,attachmentKind:combined.length<=5000000?'information-card-plus-official-page-screenshot':'official-page-screenshot-with-card-download-link'};
}
export async function auditNotificationImages(reader,products,previous){
 const originals=products.filter(p=>p.originalImageUrl).map(p=>({sku:p.sku+'-original',variantImageUrl:p.originalImageUrl}));
 const audit=await reader.auditImages([...products,...originals],previous,{bodyBatchSize:10});
 for(const p of products){const origin=originals.find(o=>o.sku===p.sku+'-original');if(origin?.cachedImageUrl){p.originalCachedImageUrl=origin.cachedImageUrl;p.originalImageEvidence={...origin.imageCacheEvidence,width:audit.entries[p.originalImageUrl]?.width,height:audit.entries[p.originalImageUrl]?.height};}}
 return audit;
}
