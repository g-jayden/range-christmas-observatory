import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';import{createHash}from'node:crypto';
import{prepareSpringHumanPreviews}from'../server/spring-human-previews.mjs';
import{optimiseProductPreviews,applyProductPreviews}from'../server/product-previews.mjs';
const before=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'spring-human-preview-'));
try{process.chdir(dir);const bytes=await sharp({create:{width:1600,height:800,channels:3,background:'#a7cbaa'}}).jpeg().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex'),file='images/source/'+hash+'.jpg',url='https://www.therange.co.uk/media/source.jpg';await fs.mkdir('web/images/source',{recursive:true});await fs.writeFile('web/'+file,bytes);
const p={sku:'123',variantId:'456',priceGBP:12.99,dimensions:{label:'80cm'},detailsReady:true,detailEvidence:{verifiedProductSection:true,selectedSku:'123',sourceContentHash:'source'},originalCachedImageUrl:file,originalImageEvidence:{sourceUrl:url,sha256:hash,width:1600,height:800},originalImages:[{url,selectedSku:'123',variantId:'456'}],previewImage:{sourceUrl:'https://www.therange.co.uk/media/old-closeup.jpg'}};
const review={disposition:'include',wholeProductFrame:true,reviewArtifact:'seen-whole-original',reason:'Exact source and whole frame reviewed',imageHash:hash,sourceContentHash:'source'};
const result=await prepareSpringHumanPreviews([p],{products:{123:review}});assert(result.prepared.has('123'));assert.equal(result.sourceRequests,0);assert.equal(p.previewImage.sourceUrl,url);assert.equal(p.previewImage.width,600);assert.equal(p.previewImage.height,300);assert.equal(p.previewImage.originalSha256,hash);assert.equal(p.originalImageEvidence.sha256,hash);assert.deepEqual(await fs.readFile('web/'+file),bytes);assert.equal(p.priceGBP,12.99);assert.equal(p.dimensions.label,'80cm');
const saved=await fs.readFile('web/'+p.previewImage.cachePath);assert.equal(createHash('sha256').update(saved).digest('hex'),p.previewImage.sha256);
await optimiseProductPreviews([]);assert.deepEqual(await fs.readFile('web/'+p.previewImage.cachePath),saved,'Another retailer update must preserve the registered human-selected preview');
const selected={...p};await applyProductPreviews([selected]);assert.equal(selected.previewImage.sourceUrl,url);
const stale={...p,detailEvidence:{...p.detailEvidence,sourceContentHash:'changed'}};await applyProductPreviews([stale]);assert.equal(stale.previewImage,undefined,'A registered human preview must expire when source facts change');
assert.equal((await prepareSpringHumanPreviews([{...p,detailEvidence:{...p.detailEvidence,sourceContentHash:'changed'}}],{products:{123:review}})).prepared.size,0);
assert.equal((await prepareSpringHumanPreviews([p],{products:{123:{...review,wholeProductFrame:false}}})).prepared.size,0);
console.log('PASS: human-verified native frames create uncropped proportional previews locally, preserve untouched native bytes and price/size, and reject stale or unconfirmed reviews without any source request.');
}finally{process.chdir(before);await fs.rm(dir,{recursive:true,force:true});}
