import fs from 'node:fs/promises';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {renderer} from './mail-assets.mjs';
import {cataloguePdf} from '../web/catalogue-pdf.mjs';
import {nativeImageCandidates} from '../web/product-facts.mjs';
import {allowedPublicImage} from '../cloud/public-image.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function pdfSourceImage(bytes,sharp){const meta=await sharp(bytes).metadata();if(!meta.width||!meta.height)throw Error('Original source pixels missing');if(meta.format==='jpeg'&&meta.channels===3)return{bytes:new Uint8Array(bytes),width:meta.width,height:meta.height,filter:'DCTDecode'};const {data,info}=await sharp(bytes).flatten({background:'white'}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});if(info.channels!==3)throw Error('Expected native RGB pixels');return{bytes:new Uint8Array(deflateSync(data)),width:info.width,height:info.height,filter:'FlateDecode'};}
export async function createCatalogueReport(products,{output,readImage,onProgress}={}){
 const sharp=await renderer(),cache=new Map();
 const image=async p=>{if(readImage)return pdfSourceImage(await readImage(p),sharp);const candidates=nativeImageCandidates(p);let error;for(const source of candidates)try{let b;if(source.startsWith('images/')){b=await fs.readFile('web/'+source);if(source===p.originalCachedImageUrl&&p.originalImageEvidence?.sha256&&createHash('sha256').update(b).digest('hex')!==p.originalImageEvidence.sha256)throw Error('Native image source digest changed');}else{if(!allowedPublicImage(source))throw Error('Unexpected native image origin');const r=await fetch(source,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Original source HTTP '+r.status);b=Buffer.from(await r.arrayBuffer());}return await pdfSourceImage(b,sharp);}catch(e){error=e;}throw error||Error('Exact product original image absent');};
 const text=async(s,width,height,font)=>{const key=[s,width,height,font].join('/');if(cache.has(key))return cache.get(key);const lines=[];for(const part of s.split('\n')){let line='',used=0;for(const c of part){const size=/[\u0000-\u00ff]/.test(c)?.58:1;if((used+size)*font>width-16&&line){lines.push(line);line='';used=0;}line+=c;used+=size;}if(line)lines.push(line);}if(lines.length*font*1.3>height-8){font=Math.max(12,Math.floor((height-8)/lines.length/1.3));}const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" fill="white"/><g font-family="Noto Sans CJK SC" font-size="'+font+'" fill="#183c32">'+lines.map((line,i)=>'<text x="2" y="'+(font+i*font*1.3)+'">'+esc(line)+'</text>').join('')+'</g></svg>';const asset=await pdfSourceImage(await sharp(Buffer.from(svg)).png().toBuffer(),sharp);cache.set(key,asset);return asset;};
 const bytes=await cataloguePdf(products,{image,text,onProgress});if(output){await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,bytes);}return bytes;
}
