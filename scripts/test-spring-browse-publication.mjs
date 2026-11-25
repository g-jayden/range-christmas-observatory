import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {SPRING_VERSION} from '../web/spring-model.mjs';
import {verifiedSpringBrowse,publishVerifiedSpringBrowse} from '../server/spring-browse-publication.mjs';
import {buildBrowseCatalogues} from './build-browse-catalogues.mjs';
const observedAt='2026-11-24T06:00:00Z',hash='a'.repeat(64),photo='https://www.therange.co.uk/media/exact.jpg';
const product={sku:'1',variantId:'2',retailerId:'the-range',collectionId:'spring',recordType:'sku',inStock:true,priceGBP:9.99,department:'spring-stems',departmentIds:['spring-stems'],variantName:'White Artificial Flower Stem',sourceUrl:'https://www.therange.co.uk/p/exact/#1',detailsReady:true,detailEvidence:{selectedSku:'1',verifiedProductSection:true,sourceContentHash:'source-details'},springNativePhotoVerified:true,originalCachedImageUrl:'images/source/'+hash+'.jpg',originalImageEvidence:{sha256:hash,sourceUrl:photo,width:1500,height:1500},originalImages:[{url:photo,selectedSku:'1'}],springAudit:{version:SPRING_VERSION,disposition:'include',imageHash:hash,sourceContentHash:'source-details'},previewAudit:{status:'kept',issues:[]},springDimensionAudit:{status:'source-specifications'}};
const catalogue={version:SPRING_VERSION,retailerId:'the-range',collectionId:'spring',collectionComplete:true,observedAt,source:{expected:3,observed:3,unique:3,complete:true},products:[product],revision:createHash('sha256').update(JSON.stringify([product])).digest('hex'),ready:false};
const review={observedAt,totalSourceSkus:3,included:1,displayedUnique:1,pending:[{sku:'3'}],excluded:[{sku:'4'}],counts:{'spring-stems':1}},status={observedAt,revision:catalogue.revision,totalSourceSkus:3,products:1,reviewPending:1,ready:false};
const accepted=verifiedSpringBrowse(catalogue,review,status);
assert.equal(accepted.browseReady,true);assert.equal(accepted.reviewComplete,false);assert.equal(accepted.ready,false);assert.equal(accepted.reviewPending,1);assert.deepEqual(accepted.products,[product]);
for(const mutate of [c=>c.products[0].springAudit.disposition='review',c=>c.products[0].detailEvidence.selectedSku='other',c=>c.products[0].previewAudit.issues=['cropped'],c=>c.products[0].originalImageEvidence.sha256='b'.repeat(64),c=>c.products[0].originalImages[0].selectedSku='other',c=>c.products[0].springDimensionAudit.status='unresolved']){const bad=structuredClone(catalogue);mutate(bad);bad.revision=createHash('sha256').update(JSON.stringify(bad.products)).digest('hex');assert.throws(()=>verifiedSpringBrowse(bad,review,{...status,revision:bad.revision}),/Spring browse publication/);}
assert.throws(()=>verifiedSpringBrowse(catalogue,{...review,pending:[{sku:'1'}]},status),/held SKU/);
assert.throws(()=>verifiedSpringBrowse(catalogue,review,{...status,observedAt:'2026-11-23T06:00:00Z'}),/mixed observation/);
assert.throws(()=>verifiedSpringBrowse({...catalogue,source:{...catalogue.source,complete:false}},review,status),/complete official source/);
assert.throws(()=>verifiedSpringBrowse({...catalogue,source:{...catalogue.source,observed:2}},review,status),/totals disagree/);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'spring-browse-publication-'));
try{
 const source=path.join(dir,'web'),target=path.join(dir,'public');await fs.mkdir(path.join(source,'spring'),{recursive:true});
 assert.equal((await publishVerifiedSpringBrowse(source,target)).browseReady,false);
 for(const[name,data]of [['candidate-catalogue.json',catalogue],['review.json',review],['status.json',status]])await fs.writeFile(path.join(source,'spring',name),JSON.stringify(data));
 const published=await publishVerifiedSpringBrowse(source,target);assert.equal(published.products,1);assert.equal(published.firecrawlCredits,0);assert.equal(published.sourceRequests,0);
 assert.equal(JSON.parse(await fs.readFile(path.join(target,'spring/status.json'),'utf8')).ready,false);
 await buildBrowseCatalogues(target,{departments:[{id:'spring-stems'}],previews:false,fullViews:false});
 const manifest=JSON.parse(await fs.readFile(path.join(target,'browse-index.json'),'utf8')),entry=manifest.scopes['spring-stems'];assert.equal(entry.products,1);
 const first=JSON.parse(await fs.readFile(path.join(target,entry.firstScreen.url),'utf8'));assert.equal(first.browseReady,true);assert.equal(first.reviewPending,1);assert.equal(first.ready,false);assert.deepEqual(first.products,[product]);
 const list=JSON.parse(await fs.readFile(path.join(target,entry.directoryIndex.url),'utf8'));assert.equal(list.products.length,1);assert.equal(list.reviewPending,1);assert.equal(list.products[0].sku,'1');
 assert.equal(await fs.readFile(path.join(source,'spring/candidate-catalogue.json'),'utf8'),JSON.stringify(catalogue),'Publication cannot rewrite source facts or fake review completion');
 const native={url:photo,ok:true,hash,cachedImageUrl:product.originalCachedImageUrl,width:1500,height:1500};await fs.writeFile(path.join(source,'spring/image-checkpoint.json'),JSON.stringify({entries:{[photo]:native}}));
 await publishVerifiedSpringBrowse(source,target);const galleryView=JSON.parse(await fs.readFile(path.join(target,'spring/catalogue.json'),'utf8')),galleryStatus=JSON.parse(await fs.readFile(path.join(target,'spring/status.json'),'utf8'));
 assert.equal(galleryView.products[0].originalImages[0].nativeCachePath,native.cachedImageUrl);assert.equal(galleryView.products[0].originalImages[0].sourceWidth,1500);assert.equal(galleryView.products[0].priceGBP,product.priceGBP);assert.equal(galleryView.products[0].observedAt,product.observedAt);assert.equal(galleryStatus.reviewPending,1);assert.equal(galleryStatus.ready,false);assert.equal(galleryStatus.revision,galleryView.revision);assert.equal(galleryView.revision,createHash('sha256').update(JSON.stringify(galleryView.products)).digest('hex'));assert.equal(await fs.readFile(path.join(source,'spring/candidate-catalogue.json'),'utf8'),JSON.stringify(catalogue),'Native gallery viewer links must not rewrite the accepted source catalogue');
}finally{await fs.rm(dir,{recursive:true,force:true});}
// Execute the real status poll: Christmas's shared Range status must not
// overwrite the active Spring observation or its outstanding review count.
const dashboard=await fs.readFile(new URL('../web/dashboard-full.js',import.meta.url),'utf8'),pollCode=dashboard.slice(dashboard.indexOf('async function poll(){'),dashboard.indexOf('setInterval(()=>{const day=beijingDay();'));
const elements={},none=()=>false,noop=()=>{};
const context={scope:'spring-stems',E:id=>elements[id]??={textContent:''},readStatus:async()=>({}),read:async name=>name==='spring/status.json'?{...status,products:2804,reviewPending:161}:name==='collection-ledger.json'?{}:null,isSpringScope:()=>true,externalScope:none,sourceFor:()=>({observedAt}),A:{},D:{},C:null,L:null,T:null,AR:null,MT:null,BQ:null,NX:null,JL:null,DU:null,HB:null,BM:null,MS:null,AS:null,browseLoader:{check:async()=>[]},date:String,beijingDay:()=>observedAt.slice(0,10),Promise,departmentViews:new Map};
for(const id of ['Ar','Mt','Bq','Nx','Jl','Du','Hb','Bm','Ms','Asda'])context['is'+id+'Scope']=none;
for(const id of ['Ar','Mt','Bq','Nx','Jl'])context['load'+id]=noop;
await runInNewContext(pollCode+'\npoll();',context);
assert.match(elements.freshness.textContent,/Spring/);assert.match(elements.freshness.textContent,/2804/);assert.match(elements.freshness.textContent,/161/);assert.doesNotMatch(elements.freshness.textContent,/Trees \/ Skirts|Status unavailable/);
console.log('PASS: pending Spring SKUs no longer block individually accepted products; exact-SKU/photo/size gates, review accounting, immutable fast views and unchanged source facts remain enforced.');
