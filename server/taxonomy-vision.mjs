import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {atomicJson} from './sync.mjs';
export const VISION_VERSION='clip-vit-base-patch32-q8-object-season-20261104-v2';
const OBJECTS=[
 ['wreath','a full size circular foliage wreath for a front door'],
 ['wreath','a round pinecone wreath to hang on a wall'],
 ['garland','a long continuous Christmas foliage garland draped over a fireplace'],
 ['garland','a long string garland made of beads, ribbons or tinsel'],
 ['tree-decorations','a small hanging Christmas tree ornament on a thread'],
 ['tree-decorations','a miniature wreath shaped Christmas tree ornament'],
 ['tree-decorations','a box of Christmas baubles or a Christmas tree topper'],
 ['wall','a long metal over door hook for hanging a wreath'],
 ['wall','a hanging Christmas bell, plaque, sign or wall decoration'],
 ['wall','a framed picture or printed canvas for a wall'],
 ['scenes','a small ceramic Christmas house ornament'],
 ['scenes','a miniature illuminated Christmas village scene or model train'],
 ['scenes','a glass snow globe with a miniature scene inside'],
 ['standing','a free standing decorative Santa, snowman, reindeer or gnome figure'],
 ['standing','a Christmas nutcracker soldier or figurine standing on a base'],
 ['spray','a single artificial flower, leaf or berry pick on a long stem'],
 ['spray','a decorative poinsettia flower stem or a bunch of artificial branches'],
 ['swag','a teardrop shaped bundle of foliage or hanging Christmas swag'],
 ['candle-holder','a candle holder, candlestick, tealight holder or candelabra'],
 ['inflatable','a large air inflated Christmas character decoration'],
 ['presents','a decorative stack of wrapped Christmas gift box shapes'],
 ['presents','an illuminated present shaped box decoration'],
 ['lights','a set of string lights, icicle lights or net lights'],
 ['lights','a decorative lantern with a light inside'],
 ['lights','an illuminated neon sign or shaped decorative light'],
 ['tree','a full artificial Christmas tree standing on a floor'],
 ['skirt','a fabric Christmas tree skirt or collar around a tree base'],
 ['ornaments','a Christmas stocking or sack made of fabric'],
 ['ornaments','a flat diamond painting or craft kit in retail packaging'],
 ['ornaments','Christmas gift wrapping paper, tags, bags or ribbons'],
 ['ornaments','a mug, cushion, bedding or household accessory with a Christmas print'],
 ['ornaments','a general Christmas decorative accessory'],
 ['plant','a real living green plant or shrub in a nursery pot'],
 ['electrical-accessory','a pack of batteries, extension cable, socket or lighting connector']
];
const SEASONS=[
 ['christmas','a photo of a Christmas decoration'],
 ['halloween','a photo of a Halloween decoration'],
 ['autumn','a photo of an autumn harvest decoration'],
 ['spring','a photo of spring or summer flowers'],
 ['easter','a photo of an Easter decoration'],
 ['neutral','a photo of an ordinary household product']
];
let engine;
async function classifier(){if(!engine)engine=(async()=>{const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir=path.resolve('runtime/models');return pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{dtype:'q8',device:'cpu'});})();return engine;}
function aggregate(scores,choices){const map=new Map();for(const s of scores){const id=choices.find(x=>x[1]===s.label)?.[0];if(id)map.set(id,Math.max(s.score,map.get(id)||0));}const sum=[...map.values()].reduce((a,b)=>a+b,0);return [...map].map(([id,score])=>({id,score:Math.round(score/sum*10000)/10000})).sort((a,b)=>b.score-a.score);}
export async function readTaxonomyImageCache(file='web/taxonomy-image-cache.json'){
 try{return JSON.parse(gunzipSync(await fs.readFile(file+'.gz')).toString());}catch(e){if(e.code!=='ENOENT')throw e;}
 return fs.readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return {version:VISION_VERSION,entries:{}};});
}
async function writeTaxonomyImageCache(file,cache){const target=file+'.gz',temp=target+'.tmp';await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(temp,gzipSync(JSON.stringify(cache)));await fs.rename(temp,target);}
export async function auditProductImages(products,{batchSize=24,cacheFile='web/taxonomy-image-cache.json'}={}){
 const cache=await readTaxonomyImageCache(cacheFile);
 if(cache.version!==VISION_VERSION){for(const e of Object.values(cache.entries))e.needsSeasonRefresh=true;cache.version=VISION_VERSION;}
 const groups=new Map(),unavailable=[];
 for(const p of products){const hash=p.displayImage?.sha256||p.imageCacheEvidence?.sha256;if(hash&&(p.displayImage?.cachePath||p.cachedImageUrl)){if(!groups.has(hash))groups.set(hash,[]);groups.get(hash).push(p);}else unavailable.push(p.sku);}
 const queue=[...groups].filter(([hash])=>!cache.entries[hash]||cache.entries[hash].needsSeasonRefresh),model=queue.length?await classifier():null;let analysed=0;
 for(let offset=0;offset<queue.length;offset+=batchSize){const batch=queue.slice(offset,offset+batchSize),valid=[];
  for(const [hash,rows]of batch){const file='web/'+(rows[0].displayImage?.cachePath||rows[0].cachedImageUrl);try{const bytes=await fs.readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('cached source digest mismatch');valid.push({hash,rows,file});}catch(e){for(const p of rows)unavailable.push(p.sku);}}
  if(valid.length){const files=valid.map(x=>x.file),objects=valid.every(x=>cache.entries[x.hash]?.objects)?null:await model(files,OBJECTS.map(x=>x[1])),seasons=await model(files,SEASONS.map(x=>x[1]));
   for(let i=0;i<valid.length;i++)cache.entries[valid[i].hash]={imageHash:valid[i].hash,model:VISION_VERSION,analysedAt:new Date().toISOString(),objects:objects?aggregate(objects[i],OBJECTS):cache.entries[valid[i].hash].objects,seasons:aggregate(seasons[i],SEASONS),method:'local-source-image-model-object-and-season',humanReviewed:false};
   analysed+=valid.length;
  }
  if(offset%240===0||offset+batchSize>=queue.length){await writeTaxonomyImageCache(cacheFile,cache);console.log(JSON.stringify({phase:'all-category-image-audit',analysed,total:queue.length,cached:groups.size-queue.length,firecrawlCredits:0}));}
 }
 for(const [hash,rows]of groups)for(const p of rows)if(cache.entries[hash])p.taxonomyVisual=cache.entries[hash];
 return {uniqueImages:groups.size,analysed,reused:groups.size-queue.length,unavailableSkus:[...new Set(unavailable)],firecrawlCredits:0};
}
