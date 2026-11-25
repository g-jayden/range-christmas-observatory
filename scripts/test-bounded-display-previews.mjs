import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MAX_DISPLAY_PREVIEW_BYTES} from '../server/display-preview.mjs';
import {createCardPreviewBuilder} from './build-card-previews.mjs';
import {nativeImageCandidates} from '../web/product-facts.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'bounded-preview-')),hash=b=>createHash('sha256').update(b).digest('hex');
try{
 let seed=731;const pixels=Buffer.alloc(800*1600*3);for(let n=0;n<pixels.length;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[n]=seed>>>24;}
 const original=await sharp(pixels,{raw:{width:800,height:1600,channels:3}}).jpeg({quality:95}).toBuffer(),digest=hash(original),file='images/source/'+digest+'.jpg';
 const old=await sharp(original).resize({width:384,height:384,fit:'inside',withoutEnlargement:true}).webp({quality:95}).toBuffer();assert(old.length>MAX_DISPLAY_PREVIEW_BYTES);
 const encodings=root+'/encodings',cacheBase=encodings+'/'+digest+'-whole384q72';await fs.mkdir(encodings,{recursive:true});
 const previous={url:'card-previews/'+hash(old)+'.webp',sourceImageHash:digest,sourceWidth:800,sourceHeight:1600,representation:'uncropped-display-preview-native-original-retained'};
 await fs.writeFile(cacheBase+'.webp',old);await fs.writeFile(cacheBase+'.json',JSON.stringify(previous));
 const p={retailerId:'nx',sku:'exact',priceGBP:19.99,specifications:{Height:'160cm'},previewImage:{cachePath:file,sha256:digest},originalCachedImageUrl:file,originalImageUrl:'https://source.invalid/exact.jpg',originalImageEvidence:{sourceUrl:'https://source.invalid/exact.jpg',sha256:digest}};
 const builder=createCardPreviewBuilder(root+'/public',{sourceRoot:root+'/absent',encodingCacheRoot:encodings,fetchVerified:true,fetcher:async()=>assert.fail('A saved encoding upgrades without a network request')});
 const results=await Promise.all(Array.from({length:8},()=>builder.build(p)));const updated=results[0],bytes=await fs.readFile(root+'/public/'+updated.fastPreview.url),meta=await sharp(bytes).metadata();
 assert(bytes.length<=MAX_DISPLAY_PREVIEW_BYTES);assert(meta.width<=384&&meta.height<=384);assert(Math.abs(meta.width/meta.height-.5)<.01);assert.equal(updated.fastPreview.sourceImageHash,digest);assert.notEqual(updated.fastPreview.url,previous.url);assert(results.every(p=>p.fastPreview.url===updated.fastPreview.url));assert.deepEqual({...updated,fastPreview:undefined},{...p,fastPreview:undefined});assert(!nativeImageCandidates(updated).includes(updated.fastPreview.url));
 assert.equal(builder.stats().repositoryImageRequests,0);assert.equal(builder.stats().officialPreviewImageRequests,0);assert.equal(builder.stats().firecrawlCredits,0);
 const source=root+'/web';await fs.mkdir(path.join(source,path.dirname(file)),{recursive:true});await fs.writeFile(path.join(source,file),original);
 const next=createCardPreviewBuilder(root+'/next',{sourceRoot:source,encodingCacheRoot:encodings,fetchVerified:false}),again=await next.build(p);assert.equal(again.fastPreview.url,updated.fastPreview.url);const native=await next.warmNative(again);assert(native.browseNative);assert.equal(hash(await fs.readFile(root+'/next/'+native.browseNative.url)),digest);assert.equal(hash(await fs.readFile(path.join(source,file))),digest,'Native source and PDF inputs are never compressed by the display encoder');
 console.log('Oversized cached display previews upgrade without source requests, preserve whole-frame proportions and every offer fact, coalesce concurrent work, and leave full-resolution native/PDF bytes unchanged.');
}finally{await fs.rm(root,{recursive:true,force:true});}
