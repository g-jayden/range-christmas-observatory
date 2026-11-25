import assert from'node:assert/strict';
import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{createHash}from'node:crypto';import sharp from'sharp';
import{browseNativePriorityOrder}from'../server/browse-native-priority.mjs';
import{createCardPreviewBuilder}from'./build-card-previews.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'fair-native-first-'));
try{
 const source=root+'/web';await fs.mkdir(source+'/images/source',{recursive:true});const rows=[];
 for(let i=0;i<7;i++){
  const jpeg=await sharp({create:{width:1500,height:1500,channels:3,background:{r:20+i*20,g:75,b:90}}}).jpeg().toBuffer(),bytes=Buffer.concat([jpeg,Buffer.alloc(2000000-jpeg.length)]),sha256=createHash('sha256').update(bytes).digest('hex'),file='images/source/'+sha256+'.jpg',url='https://www.therange.co.uk/media/native-priority-'+i+'.jpg',sku='priority-'+i;
  await fs.writeFile(source+'/'+file,bytes);rows.push({retailerId:'the-range',collectionId:'spring',sku,variantId:sku,department:i===6?'spring-potted':'spring-stems',priceGBP:10+i,sourceUrl:'https://www.therange.co.uk/p/fixture/#'+sku,originalImageUrl:url,originalCachedImageUrl:file,originalImageEvidence:{sourceUrl:url,selectedSku:sku,sha256,width:1500,height:1500,bytes:bytes.length},originalImages:[{url,selectedSku:sku,variantId:sku}],...(i===6?{newStatus:true,arrivalEvidence:'observed-after-baseline',firstNewObservedAt:new Date().toISOString()}:{})});
 }
 const old=rows.slice(0,6),today=rows[6],builder=folder=>createCardPreviewBuilder(root+'/'+folder,{sourceRoot:source,encodingCacheRoot:root+'/'+folder+'-encodings',fetchVerified:false,fetcher:()=>assert.fail('Native priority cannot call a retailer or paid service')});
 const before=builder('before');for(const p of old)await before.warmNative(p);assert.equal((await before.warmNative(today)).browseNative,undefined,'Reproduce: the first category exhausts the shared byte budget before a later category\'s genuine arrival');
 const scopes=[{id:'spring-stems',products:old},{id:'spring-potted',products:[today,today]}],order=browseNativePriorityOrder(scopes);assert.equal(order[0],today);assert.equal(order[1],old[0]);assert.equal(order.length,2,'Repeated theme/category references cannot repeat the same native priority transfer');
 const after=builder('after');for(const p of order)await after.warmNative(p);for(const p of old)await after.warmNative(p);const warmed=await after.warmNative(today);assert(warmed.browseNative,'The later department\'s current arrival must retain an own-site exact native original');assert((await after.warmNative(old[0])).browseNative,'Each category gets its first original before the remainder of an early category');
 assert.equal(createHash('sha256').update(await fs.readFile(root+'/after/'+warmed.browseNative.url)).digest('hex'),today.originalImageEvidence.sha256,'Source bytes are unchanged');assert(after.stats().firstScreenNativeBytes<=8*1024*1024,'Fair ordering must not increase the retailer storage allowance');assert.equal(after.stats().firecrawlCredits,0);assert.equal(after.stats().officialPreviewImageRequests,0);for(const key of['priceGBP','sourceUrl','originalImages','originalImageEvidence','firstNewObservedAt'])assert.deepEqual(warmed[key],today[key]);
 assert.equal(browseNativePriorityOrder([{products:[{...today,originalImages:[],originalImageUrl:'',originalCachedImageUrl:'',variantImageUrl:''}]}]).length,0,'An unverified missing image cannot acquire a priority native URL');
 console.log('PASS: actual shared-byte-budget starvation reproduced and fixed; today arrivals across categories precede historical first-screen extras, each category gets a turn, and native bytes, source facts, storage allowance and zero collection credits are preserved.');
}finally{await fs.rm(root,{recursive:true,force:true});}
