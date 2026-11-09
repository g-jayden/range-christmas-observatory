import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readFamilyBundle} from '../server/firecrawl-browser.mjs';
import {parseDetails,applyDetails} from '../server/details.mjs';
import {bestVerifiedEvidence,reconcileVerifiedEvidence,saveVerifiedRegistry,restoreVerifiedRegistry} from '../server/verified-evidence.mjs';
import {borrowThemeEvidence} from '../server/themes.mjs';
import {borrowLightingEvidence} from '../server/lights.mjs';
import {repairDirectImages,restoreObservedImages} from '../server/direct-image-repair.mjs';
import {createHash} from 'node:crypto';
const fixture=JSON.parse(await fs.readFile('test/fixtures/variant-json-only-1684540.json','utf8')),url='https://www.therange.co.uk/p/metal-angel-christmas-stocking-hook-hanger/m1684540',sku='1684540';
const priorFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('Fixture HTML unavailable',{status:403});
try{
 const b=await readFamilyBundle({url,jsonUrl:url+'?json',initial:fixture,anchors:[{sku}]});assert.equal(b.status,200);assert.equal(b.evidence.htmlAvailable,false);assert.deepEqual(b.evidence.gallery,[]);b.evidence.observedAt='2026-11-09T09:00:00Z';
 const d=parseDetails({success:true,data:{metadata:{statusCode:200},sourceVariant:b.variants[0],familyEvidence:b.evidence}},sku,url+'/#'+sku);assert.equal(d.specs.Width,'14cm');assert.equal(d.specs.Length,'9cm');assert.equal(d.specs.Colour,'Gold');assert.equal(d.verificationMethod,'official-exact-SKU-variant-json');assert.equal(d.originalImages.length,0,'JSON specifications do not invent gallery originals');
 for(const anchors of [[{sku:'999999'}],[{sku,variantId:'wrong-variant'}]])assert.equal((await readFamilyBundle({url,jsonUrl:url+'?json',initial:fixture,anchors})).status,403);
 const different=structuredClone(fixture);different.variant_arr[0].code='another-code';assert.equal((await readFamilyBundle({url,jsonUrl:url+'?json',initial:different,anchors:[{sku}]})).status,403);
 await assert.rejects(readFamilyBundle({url,jsonUrl:'https://attacker.invalid/?json',initial:fixture,anchors:[{sku}]}));
 const p={sku,kind:'decoration',variantName:'Christmas Angel',sourceUrl:url+'/#'+sku,variantImageUrl:'https://www.therange.co.uk/media/angel.jpg'};applyDetails(p,d);p.detailsReady=true;
 const bad={...p,detailEvidence:undefined,detailsReady:false},one={products:[structuredClone(bad)]},two={products:[structuredClone(bad)]};assert.equal(borrowThemeEvidence(one,[{products:[p]},{products:[bad]}]),1);assert.equal(borrowLightingEvidence(two,[{products:[p]},{products:[bad]}]),1,'A later incomplete record cannot mask the verified source');
 assert.equal(bestVerifiedEvidence({...bad,variantImageUrl:'https://www.therange.co.uk/media/other.jpg'},[p]),undefined);assert.equal(bestVerifiedEvidence({...bad,detailIssue:{observedAt:'2026-11-09T10:00:00Z'}},[p]),undefined,'A newer failed verification cannot be erased with an older source');
 const changed={...bad,priceGBP:99,newStatus:true,firstNewObservedAt:'2026-11-09T01:00:00Z'};assert.equal(reconcileVerifiedEvidence([{products:[changed]},{products:[p]}]).restored,1);assert.equal(changed.priceGBP,99);assert.equal(changed.firstNewObservedAt,'2026-11-09T01:00:00Z');assert.equal(changed.attributeObservedAt,p.attributeObservedAt,'Source dates remain truthful');
 const cwd=process.cwd(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'range-evidence-'));
 try{process.chdir(dir);await fs.mkdir('web');await saveVerifiedRegistry([p]);await saveVerifiedRegistry([bad]);const recovered=structuredClone(bad);assert.equal((await restoreVerifiedRegistry([recovered])).restored,1);assert.equal(recovered.specifications.Width,'14cm');
  const sharp=(await import('sharp')).default,bytes=await sharp({create:{width:80,height:100,channels:3,background:'red'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
  const photo={sku:'1',variantImageUrl:'https://www.therange.co.uk/media/red.png'},refused={sku:'2',variantImageUrl:'https://www.therange.co.uk/media/refused.png'},s={products:[photo,refused]};let requests=0;
  const audit=await repairDirectImages([s],{fetcher:async u=>{requests++;return u===photo.variantImageUrl?new Response(bytes,{headers:{'content-type':'image/png'}}):new Response('No image',{status:403})}});assert.equal(audit.downloaded,1);assert.equal(audit.failed,1);assert.equal(photo.imageCacheEvidence.sha256,hash);assert.equal(createHash('sha256').update(await fs.readFile('web/'+photo.cachedImageUrl)).digest('hex'),hash);assert.equal(refused.cachedImageUrl,undefined);
  const currentRequests=requests;await repairDirectImages([{products:[photo]}],{fetcher:()=>{throw Error('Verified photo bytes must not be downloaded twice')}});assert.equal(requests,currentRequests);
  const stale={sku:'1',variantImageUrl:photo.variantImageUrl,cachedImageUrl:photo.cachedImageUrl,imageCacheEvidence:{...photo.imageCacheEvidence,sourceUrl:'https://www.therange.co.uk/media/old.png'}},otherSku={sku:'999',variantImageUrl:photo.variantImageUrl};assert.equal((await restoreObservedImages([{products:[photo]},{products:[stale,otherSku]}])).recoveredRows,1);assert.equal(stale.imageCacheEvidence.sourceUrl,photo.variantImageUrl,'A reused theme photo must follow its actual current photograph URL');assert.equal(otherSku.cachedImageUrl,undefined,'Existing cached bytes cannot cross SKU identity');
  await fs.writeFile('web/browser-image-recovery.json',JSON.stringify({entries:{[photo.variantImageUrl]:{ok:true,hash,cachedImageUrl:photo.cachedImageUrl,observedAt:'2026-11-09T10:00:00Z',skus:['1']}}}));const missing={sku:'1',variantImageUrl:photo.variantImageUrl},wrong={sku:'999',variantImageUrl:photo.variantImageUrl};assert.equal((await restoreObservedImages([{products:[missing,wrong]}])).recoveredRows,1);assert.equal(missing.cachedImageUrl,photo.cachedImageUrl);assert.equal(wrong.cachedImageUrl,undefined,'A browser-recovered image cannot cross its recorded SKU association');await fs.writeFile('web/'+photo.cachedImageUrl,'corrupted bytes');assert.equal((await restoreObservedImages([{products:[{sku:'1',variantImageUrl:photo.variantImageUrl}]}])).recoveredRows,0);
 }finally{process.chdir(cwd);await fs.rm(dir,{recursive:true,force:true});}
 console.log('PASS: real exact-SKU JSON survives HTML 403; wrong SKU/variant/endpoint rejected; newest verified evidence wins across categories; verified registry survives incomplete publication; current offers/arrival/source dates preserved; original image bytes restored without paid requests; failed image remains unverified.');
}finally{globalThis.fetch=priorFetch;}
