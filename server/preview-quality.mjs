import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
export const PREVIEW_QUALITY_VERSION='whole-product-preview-20261104-v2';
const PROMPTS=[
 ['whole','a photograph of a whole product on a plain background'],
 ['whole','a photograph of a complete product filling most of the image'],
 ['detail','a close-up photograph showing only part of a product'],
 ['logo','a brand logo with text and no product'],
 ['diagram','an infographic showing dimensions and measurements'],
 ['room','a lifestyle room scene with a small product on furniture'],
 ['packaging','a product in retail packaging']
];
let engine;
async function classifier(){if(!engine)engine=(async()=>{const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir=path.resolve('runtime/models');return pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{dtype:'q8',device:'cpu'});})();return engine;}
export async function readPreviewQuality(file='web/preview-quality-cache.json.gz'){try{return JSON.parse(gunzipSync(await fs.readFile(file)));}catch(e){if(e.code!=='ENOENT')throw e;return {version:PREVIEW_QUALITY_VERSION,entries:{}};}}
export async function savePreviewQuality(cache,file='web/preview-quality-cache.json.gz'){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',gzipSync(JSON.stringify(cache)));await fs.rename(file+'.tmp',file);}
export async function previewGeometry(file){
 const {default:sharp}=await import('sharp');
 const {data,info}=await sharp(file).rotate().resize(96,96,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});const w=info.width,h=info.height,channels=info.channels;let white=0,colour=0,edge=0,edgeN=0,left=0,right=0,top=0,bottom=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=(y*w+x)*channels,r=data[n],g=data[n+1],b=data[n+2],bg=Math.min(r,g,b)>235,fg=!bg&&Math.max(r,g,b)-Math.min(r,g,b)>12||Math.max(r,g,b)<210;if(bg)white++;if(Math.max(r,g,b)-Math.min(r,g,b)>35)colour++;if(x<2||x>w-3||y<2||y>h-3){edgeN++;if(fg){edge++;if(x<2)left++;if(x>w-3)right++;if(y<2)top++;if(y>h-3)bottom++;}}}
 const meta=await sharp(file).metadata();return {width:meta.width,height:meta.height,white:Math.round(white/(w*h)*1000)/1000,colour:Math.round(colour/(w*h)*1000)/1000,edge:Math.round(edge/edgeN*1000)/1000,touchedSides:[left,right,top,bottom].filter(n=>n>5).length};
}
export function previewQualityScore(q){const s=q.scores||{},g=q.geometry||{},cropped=g.white>.6&&g.edge>.025&&g.touchedSides>=2;return (s.whole||0)+.15*(s.packaging||0)-1.5*(s.logo||0)-1.25*(s.diagram||0)-.7*(s.detail||0)-.45*(s.room||0)-(cropped?.25:0);}
export function previewProblems(q){const s=q.scores||{},g=q.geometry||{},issues=[];if(s.logo>.85||s.logo>.55&&g.colour<.025)issues.push('logo');if(s.diagram>.45)issues.push('diagram');if(s.detail>.6)issues.push('detail');if(s.room>.6)issues.push('room');if(g.white>.6&&g.edge>.025&&g.touchedSides>=2)issues.push('cropped');return issues;}
export async function analysePreviewFiles(items,{cacheFile='web/preview-quality-cache.json.gz',batchSize=64}={}){
 const cache=await readPreviewQuality(cacheFile);if(cache.version!==PREVIEW_QUALITY_VERSION){cache.version=PREVIEW_QUALITY_VERSION;cache.entries={};}const unique=[...new Map(items.map(i=>[i.hash,i])).values()],queue=unique.filter(i=>!cache.entries[i.hash]),model=queue.length?await classifier():null;let analysed=0;
 for(let offset=0;offset<queue.length;offset+=batchSize){const batch=queue.slice(offset,offset+batchSize);const results=await model(batch.map(i=>i.file),PROMPTS.map(x=>x[1]));for(let n=0;n<batch.length;n++){const scores={};for(const s of results[n]){const id=PROMPTS.find(p=>p[1]===s.label)[0];scores[id]=Math.max(scores[id]||0,s.score);}const sum=Object.values(scores).reduce((a,b)=>a+b,0);for(const id of Object.keys(scores))scores[id]=Math.round(scores[id]/sum*10000)/10000;cache.entries[batch[n].hash]={scores,geometry:await previewGeometry(batch[n].file)};}analysed+=batch.length;if(offset%256===0||offset+batchSize>=queue.length){await savePreviewQuality(cache,cacheFile);console.log(JSON.stringify({phase:'local-preview-quality',analysed,total:queue.length,reused:unique.length-queue.length,firecrawlCredits:0}));}}
 return {cache,analysed,reused:unique.length-queue.length};
}
