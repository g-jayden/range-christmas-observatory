import assert from 'node:assert/strict';
import {DEPARTMENTS,ROOT_DEPARTMENTS,LIGHT_DEPARTMENTS,isLightingScope,sourcePrice,scopeProducts} from '../web/catalogue-model.mjs';
import {LIGHT_SOURCES,mergeLights,borrowLightingEvidence,enrichLighting,publishLights,loadLightingDetails} from '../server/lights.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {detailFingerprint} from '../server/collection-policy.mjs';
import {notificationSnapshot} from '../server/decorations.mjs';

assert.equal(ROOT_DEPARTMENTS.length,16);assert.equal(LIGHT_DEPARTMENTS.length,6);assert.equal(DEPARTMENTS.length,22);
for(const d of LIGHT_DEPARTMENTS){assert.equal(d.parentId,'lights');assert.equal(d.charts,false);assert(isLightingScope(d.id));}
assert.equal(sourcePrice({priceGBP:14.64,originalPrice:1627}).reduced,true);
assert.equal(sourcePrice({priceGBP:14.64,originalPrice:1464}).reduced,false);
assert.equal(sourcePrice({priceGBP:14.64,originalPrice:null}).reduced,false);
assert.equal(sourcePrice({priceGBP:14.64,originalPrice:1400}).reduced,false);
assert.equal(sourcePrice({priceGBP:14.64,originalPrice:1627,promoText:'2 for £20'}).promoText,'2 for £20');
const row=(sku,newIn=false)=>({sku:String(sku),variantId:String(sku),variantName:'Christmas light '+sku,brand:'Test',price:1464,originalPrice:1627,promoText:'Source offer',newIn,inStock:true,sponsored:false,variantImageUrl:'https://www.therange.co.uk/media/'+sku+'.jpg',imageUrl:'https://www.therange.co.uk/media/'+sku+'.jpg',productPath:'p/light/p'+sku,variantPath:'p/light/p'+sku+'#'+sku});
const complete=products=>({products,audit:{expected:products.length,observed:products.length,unique:products.length,complete:true}});
const a=row(1,true),b=row(2),unassigned=row(3),collected=Object.fromEntries(LIGHT_SOURCES.map(s=>[s.scope,complete([])]));
collected.lights=complete([a,b,unassigned]);collected['string-lights']=complete([a]);collected['indoor-lights']=complete([a,b]);collected['outdoor-lights']=complete([a]);
const initial=mergeLights({products:[],history:{},baselineReady:false},collected,'2026-11-03T00:00:00Z');assert.equal(initial.products.length,3);
const first=initial.products.find(p=>p.sku==='1');assert.equal(first.firstNewObservedAt,null);assert.equal(first.arrivalEvidence,'initial-baseline');assert.deepEqual(first.departmentIds,['lights','string-lights','indoor-lights','outdoor-lights']);
assert.deepEqual(initial.products.find(p=>p.sku==='3').departmentIds,['lights'],'Root-only lighting and accessories are retained in the parent, not invented into a sixth category');
assert.equal(scopeProducts(initial.products,'lights','new').length,1);assert.equal(scopeProducts(initial.products,'lights','today','2026-11-03T01:00:00Z').length,0);
const prior={...initial,baselineReady:true};const c=row(4,true);collected.lights=complete([a,b,unassigned,c]);collected['christmas-lanterns']=complete([c]);
const next=mergeLights(prior,collected,'2026-11-03T15:59:59Z'),arrival=next.products.find(p=>p.sku==='4');assert.equal(arrival.firstNewObservedAt,'2026-11-03T15:59:59Z');assert.equal(scopeProducts(next.products,'christmas-lanterns','today','2026-11-03T15:59:59Z').length,1);assert.equal(scopeProducts(next.products,'christmas-lanterns','today','2026-11-03T16:00:00Z').length,0);assert.equal(scopeProducts(next.products,'christmas-lanterns','new','2026-11-03T16:00:00Z').length,1);
assert.equal(next.products.find(p=>p.sku==='1').firstNewObservedAt,null,'Extending categories does not re-discover baseline NEW products');
const saved={...first,detailsReady:true,attributeObservedAt:'2026-11-02T00:00:00Z',detailEvidence:{verifiedProductSection:true,selectedSku:'1'},sourceDescription:'Exact SKU source description',specifications:{Material:'Copper',Colour:'Warm White'},cachedImageUrl:'images/source/hash.jpg',imageCacheEvidence:{sha256:'hash',sourceUrl:first.variantImageUrl}};
const reuse={products:[{...first,detailsReady:false}]};assert.equal(borrowLightingEvidence(reuse,[{products:[saved]}]),1);assert.equal(reuse.products[0].sourceDescription,saved.sourceDescription);assert.equal(reuse.products[0].attributeObservedAt,saved.attributeObservedAt);assert.equal(reuse.products[0].detailInputFingerprint,detailFingerprint(reuse.products[0]));
const changed={products:[{...first,detailsReady:false,listingVariantImageUrl:'https://www.therange.co.uk/media/different.jpg'}]};assert.equal(borrowLightingEvidence(changed,[{products:[saved]}]),0);
const analytic=enrichLighting(reuse.products);assert.equal(analytic.imageAnalysis,false);assert.equal(analytic.firecrawlCredits,0);assert.match(reuse.products[0].material,/铜.*Copper/i);
const duplicate={...a,department:'presents',departmentIds:['presents'],kind:'decoration'};const combined=notificationSnapshot({products:[],observedAt:'2026-11-02T00:00:00Z'},{products:[duplicate]},next);assert.equal(combined.products.filter(p=>p.sku==='1').length,1);assert(combined.products.find(p=>p.sku==='1').departmentIds.includes('string-lights'));assert.equal(combined.products.find(p=>p.sku==='1').department,'presents');
const invalid=structuredClone(collected);invalid['string-lights'].products[0]={...invalid['string-lights'].products[0],price:2000};assert.throws(()=>mergeLights(prior,invalid),/changed across/);
const cleared=structuredClone(collected);for(const part of Object.values(cleared))for(const r of part.products){r.originalPrice=null;r.promoText=null;}const noSale=mergeLights(prior,cleared);for(const p of noSale.products){assert.equal(p.originalPrice,null);assert.equal(sourcePrice(p).reduced,false);assert.equal(p.promoText,null);}
const cwd=process.cwd(),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'range-lights-'));
try{process.chdir(tmp);const snapshot={...initial,products:[{...saved,detailInputFingerprint:detailFingerprint(saved),originalImages:[{url:'https://www.therange.co.uk/media/original.jpg'}]}]};await publishLights(snapshot);assert.equal(snapshot.products[0].sourceDescription,undefined);await loadLightingDetails(snapshot.products);assert.equal(snapshot.products[0].sourceDescription,saved.sourceDescription,'A compact record with the same verification timestamp must restore its full description');assert.equal(snapshot.products[0].originalImages.length,1);await publishLights(snapshot);const shard=JSON.parse(await fs.readFile('web/light-details/01.json','utf8'));assert.equal(shard['1'].sourceDescription,saved.sourceDescription,'Publishing again must retain all previously verified source content');}finally{process.chdir(cwd);await fs.rm(tmp,{recursive:true,force:true});}
console.log('PASS: official six lighting memberships, complete parent coverage, cross-catalogue evidence reuse, source price precision, initial-baseline exclusion, midnight rollover and one SKU/one notification.');
