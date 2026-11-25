import assert from'node:assert/strict';
import fs from'node:fs/promises';
import path from'node:path';
import os from'node:os';
import{gzipSync}from'node:zlib';
import{bqProducts}from'../server/bq-products.mjs';
import{BQ_DEPARTMENTS}from'../web/bq-model.mjs';
import{bqAsset,bqImageKey}from'../server/bq-images.mjs';
import{writeBqCatalogue,readBqSnapshot}from'../server/bq-catalogue.mjs';
import{publishBqCommittedEvidence,prepareBqInternalEvidence}from'../server/bq-committed-evidence.mjs';
import{reportProductEvidence}from'../server/report-product-evidence.mjs';
const fixture=JSON.parse(await fs.readFile('test/fixtures/bq-baubles.json','utf8')),cwd=process.cwd(),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'bq-internal-evidence-'));
try{
 process.chdir(tmp);const source={complete:true,observedAt:'2026-11-18T00:00:00Z',categories:BQ_DEPARTMENTS.map(d=>({id:d.id.slice(3),declared:d.id==='bq-baubles'?1:0,unique:d.id==='bq-baubles'?1:0,complete:true,closingVerified:true,products:d.id==='bq-baubles'?[fixture]:[]}))},snapshot=bqProducts(source,[fixture]);
 await writeBqCatalogue(snapshot);const p=snapshot.products[0],hash='f'.repeat(64),asset=bqAsset(p.originalImageUrl),key=bqImageKey(asset),index={[key]:{asset,width:1200,height:1200,sourceVersion:'fixture-v1',sha256:hash,checkedAt:source.observedAt}},visual={[key]:{imageHash:hash,colors:['红色'],colourConfidence:.9,objectTop:[{id:'bq-tree',score:.99}],quality:{scores:{whole:.99},geometry:{}}}};
 for(const[name,value]of[['image-index.json.gz',index],['visual-cache.json.gz',visual]])await fs.writeFile('web/bq/'+name,gzipSync(JSON.stringify(value)));
 for(const[name,value]of[['reviews.json',{}],['preview-selections.json',{}]])await fs.writeFile('web/bq/'+name,JSON.stringify(value));
 const before=await fs.readFile('web/bq/catalogue.json','utf8');
 await assert.rejects(publishBqCommittedEvidence(),/source\/photo review pending/);
 await assert.rejects(publishBqCommittedEvidence({strictReview:false}),/source\/photo review pending/,'Public publication cannot bypass the whole-catalogue review');
 for(const[purpose,root]of[['native-recovery','runtime/native-recovery-evidence'],['report-candidates','runtime/digest-evidence']]){
  const result=await prepareBqInternalEvidence({purpose}),derived=await readBqSnapshot({root}),current=derived.products[0];
  assert.equal(result.firecrawlCredits,0);assert.equal(result.sourceRequests,0);assert.equal(derived.observedAt,source.observedAt);assert.equal(current.classificationEvidence.requiresReview,true);assert.equal(derived.analysisDerivation.reviewAcceptance,'per-product-approval-required');
  const verdict=reportProductEvidence(current,current,derived,{retailerId:'bq',now:Date.parse('2026-11-18T00:30:00Z')});assert.equal(verdict.accepted,false);assert(verdict.reasons.includes('physical-classification-unaccepted'),'An internal source copy must not approve the unresolved candidate for a PDF');
 }
 assert.equal(await fs.readFile('web/bq/catalogue.json','utf8'),before);
 await assert.rejects(prepareBqInternalEvidence({purpose:'public'}),/Explicit internal/);await assert.rejects(prepareBqInternalEvidence({purpose:'constructor'}),/Explicit internal/);
 index[key].sha256='a'.repeat(64);await fs.writeFile('web/bq/image-index.json.gz',gzipSync(JSON.stringify(index)));
 await assert.rejects(prepareBqInternalEvidence({purpose:'native-recovery'}),/incomplete|proof mismatch|real source previews required/,'Unbound image bytes cannot be admitted even for an internal recovery job');
 console.log('B&Q internal source recovery preserves pending review, per-product PDF rejection, public release guards and exact image identity');
}finally{process.chdir(cwd);await fs.rm(tmp,{recursive:true,force:true});}
