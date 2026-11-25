import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import{createHash}from'node:crypto';
import sharp from'sharp';
import{ASDA_BASE_COVER_LABELS,asdaBaseCoverSource,asdaBodyReviewKey,analyseAsdaBaseCover,boundAsdaBodyReview,asdaOfferedBodyVisual}from'../server/asda-offered-body-review.mjs';
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'asda-offered-body-'));
let analysisFile;
try{
 const file=path.join(tmp,'unchanged-source.png'),bytes=await sharp({create:{width:100,height:200,channels:3,background:'#a98c65'}}).png().toBuffer();await fs.writeFile(file,bytes);
 const p={retailerId:'asda',sku:'060193490',variantName:'White Scallop Edge Rattan Christmas Tree Skirt',sourceDescription:'A rattan tree collar with a white edge.',specifications:{Material:'Rattan'},detailsReady:true,detailEvidence:{selectedSku:'060193490',verifiedProductSection:true},classificationEvidence:{offeredObjectReason:'tree-base-cover'},departmentIds:['asda-tree-decorations'],imageCacheEvidence:{sha256:createHash('sha256').update(bytes).digest('hex')}};
 const scores=ASDA_BASE_COVER_LABELS.map((label,i)=>({label,score:[.06,.08,.83,.005,.005,.019,.001][i]}));
 const proof=await analyseAsdaBaseCover(p,file,{classify:async(input,labels)=>{analysisFile=input;assert.deepEqual(labels,ASDA_BASE_COVER_LABELS);const m=await sharp(input).metadata();assert.equal(m.width,100);assert.equal(m.height,104);return scores;}});
 assert.equal(proof.compatible,true);assert.equal(boundAsdaBodyReview(p,proof),true);assert.deepEqual(proof.region,{left:0,top:96,width:100,height:104});assert.deepEqual(await fs.readFile(file),bytes,'Analysis cannot change the saved source photograph');
 const whole={objectTop:[{id:'asda-tree',score:.91},{id:'asda-room',score:.06}],colors:['绿色'],colourConfidence:.8},visual=asdaOfferedBodyVisual(p,whole,proof);
 assert.equal(visual.objectTop[0].id,'asda-tree-decorations');assert.ok(Math.abs(visual.objectTop[0].score-.91)<1e-9);assert.deepEqual(visual.fullImageObjectTop,whole.objectTop);assert.deepEqual(whole.objectTop[0],{id:'asda-tree',score:.91});assert.deepEqual(visual.colors,whole.colors,'Body classification does not manufacture product colours');
 for(const changed of [{...p,sku:'different'}, {...p,sourceDescription:'Changed exact product description'}, {...p,imageCacheEvidence:{sha256:'a'.repeat(64)}}, {...p,variantName:'7ft Artificial Christmas Tree'}, {...p,detailsReady:false}, {...p,detailEvidence:{...p.detailEvidence,selectedSku:'different'}}, {...p,classificationEvidence:{offeredObjectReason:'wreath'}}]){assert.equal(asdaOfferedBodyVisual(changed,whole,proof),whole,'Different source evidence cannot reuse the tree-base judgement');}
 for(const changed of [{...p,sku:'other'}, {...p,sourceDescription:'A changed source'}, {...p,imageCacheEvidence:{sha256:'a'.repeat(64)}}])assert.notEqual(asdaBodyReviewKey(changed),asdaBodyReviewKey(p));
 for(const altered of [{...proof,sourceWidth:100.5},{...proof,sourceImageUnchanged:false},{...proof,region:{...proof.region,top:95}},{...proof,scores:scores.map(s=>({...s,score:s.score*2}))},{...proof,scores:scores.slice(1)},{...proof,scores:ASDA_BASE_COVER_LABELS.map((label,i)=>({label,score:[.83,.08,.06,.005,.005,.019,.001][i]}))}])assert.equal(asdaOfferedBodyVisual(p,whole,altered),whole,'Unbound, incomplete or disagreeing image evidence must preserve the unresolved classification');
 assert.equal(asdaBaseCoverSource({...p,retailerId:'the-range'}),false);
 await assert.rejects(analyseAsdaBaseCover({...p,imageCacheEvidence:{sha256:'a'.repeat(64)}},file),/pixels changed/);
 await assert.rejects(analyseAsdaBaseCover({...p,variantName:'Christmas Tree Storage Bag'},file),/Exact ASDA/);
 console.log('ASDA exact-source offered-body agreement, unchanged originals and invalidation tests passed');
}finally{await fs.rm(tmp,{recursive:true,force:true});if(analysisFile)await fs.rm(analysisFile,{force:true});}
