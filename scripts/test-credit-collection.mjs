import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {parseDetails,applyDetails} from '../server/details.mjs';
import {defaults} from '../server/collection-policy.mjs';
import {reserveCredits,readLedger} from '../server/credit-budget.mjs';
const fixture=JSON.parse(await fs.readFile('test/fixtures/official-variants.json','utf8'));
const base='https://www.therange.co.uk/p/7ft-neo-scandinavian-tips-spruce-fir-artificial-christmas-tree/m2372015/';
const pageEvidence={status:200,url:base,productId:'1124988',title:'Source family',features:[],information:'',offers:fixture.variant_arr.map(v=>({sku:String(v.sku),image:'https://www.therange.co.uk/media/'+v.sku+'.jpg'})),gallery:[]};
const valid={success:true,data:{metadata:{statusCode:200},sourceVariant:fixture.variant_arr.find(v=>v.sku===7305060),familyEvidence:{...pageEvidence,jsonUrl:base+'?json'}}};
const detail=parseDetails(valid,'7305060',base+'#7305060');
assert.equal(detail.specs.Colour,'Green');assert.equal(detail.specs.Material,'Plastic');assert.equal(detail.specs.Design,'Non-Flocked');assert.equal(detail.specs.Width,'105.4cm');
const product={sku:'7305060',variantName:'Non-Flocked Christmas Tree',features:{snow:true}};applyDetails(product,detail);assert.equal(product.heightLabel,'7ft');assert.equal(product.heightCm,213.36);assert.equal(product.features.snow,false);
assert.throws(()=>parseDetails(valid,'2372015',base+'#2372015'),/SKU/);
const wrongFamily=structuredClone(valid);wrongFamily.data.familyEvidence.productId='unrelated';assert.throws(()=>parseDetails(wrongFamily,'7305060',base+'#7305060'),/family ID/);
let navigations=0,apiCalls=[],closed=0;
const page={url:()=>base,goto:async()=>{navigations++;return {status:()=>200}},locator:()=>({innerText:async()=>JSON.stringify(fixture)}),evaluate:async()=>({status:200,variants:structuredClone(fixture.variant_arr),evidence:{...structuredClone(pageEvidence),jsonUrl:base+'?json'}}),};
const context={newPage:async()=>page};
const savedKey=process.env.FIRECRAWL_API_KEY;process.env.FIRECRAWL_API_KEY='test-key-never-sent';
try{
 const reader=await createFirecrawlBrowserReader({policy:defaults,budget:{limit:60},fetcher:async(url,options)=>{apiCalls.push({url,method:options.method,body:options.body&&JSON.parse(options.body)});return Response.json(options.method==='DELETE'?{success:true,creditsBilled:2,sessionDurationMs:1000}:{success:true,id:'test-session',cdpUrl:'wss://not-contacted.invalid'})},connect:async()=>({contexts:()=>[context],close:async()=>{closed++}})});
 const first=await reader.raw(base+'#7305060');const second=await reader.raw(base+'#2372015');
 assert.equal(first.data.sourceVariant.sku,7305060);assert.equal(second.data.sourceVariant.sku,2372015);
 assert.equal(navigations,0,'Families must reuse the website origin without repeated page navigation');
 assert.equal(reader.metrics().familyReads,1);assert.equal(reader.metrics().familyReuse,1);
 await reader.close();await reader.close();assert.equal(closed,1);assert.equal(apiCalls.filter(x=>x.method==='DELETE').length,1);assert.equal(reader.metrics().firecrawlCredits,2);assert.equal(reader.metrics().billingVerified,true);
 assert.equal(apiCalls[0].body.ttl,600);assert.equal(reader.metrics().fallbackLimit,40);assert(!('prompt'in apiCalls[0].body),'No AI browser prompt surcharges');assert(!apiCalls.some(c=>c.url.includes('/scrape')),'No per-product paid scrape calls');
}finally{if(savedKey===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=savedKey}
const root=process.cwd(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'range-credit-budget-'));
try{
 process.chdir(temp);
 const imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAIAAAD2HxkiAAADWUlEQVR4nO3TMQ0AMAzAsIIYnAEr/MHIMUsGkCdz9gKhyQvgcyaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIWZCiJkQYiaEmAkhZkKImRBiJoSYCSFmQoiZEGImhJgJIfYAYpW4jxcwWYcAAAAASUVORK5CYII=','base64');
 const imageHash=createHash('sha256').update(imageBytes).digest('hex');
 const sourceImage='https://www.therange.co.uk/media/fixture.png';
 process.env.FIRECRAWL_API_KEY='test-key-never-sent';
 const imageReader=await createFirecrawlBrowserReader({policy:defaults,budget:{limit:60},fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.proxy,'enhanced');assert.equal(body.maxAge,0);assert.equal(body.location.country,'GB');assert.equal(body.actions[0].type,'executeJavascript');
  return Response.json({success:true,data:{metadata:{statusCode:200,creditsUsed:1},actions:{javascriptReturns:[{value:[{url:sourceImage,ok:true,width:300,height:300,mime:'image/png',hash:imageHash,dataBase64:imageBytes.toString('base64'),bytes:imageBytes.length}]}]}}});
 },connect:async()=>{throw Error('Image batches must not open a second billed browser session')}});
 const imageProduct={sku:'fixture',variantImageUrl:sourceImage};
 const imageAudit=await imageReader.auditImages([imageProduct]);await imageReader.close();
 assert.equal(imageAudit.loaded,1);assert.equal(imageAudit.failed,0);assert.equal(imageReader.metrics().firecrawlCredits,1);assert.equal(imageReader.metrics().billingVerified,true);
 assert.deepEqual(await fs.readFile('web/'+imageProduct.cachedImageUrl),imageBytes,'Published image bytes must match the verified source exactly');assert.equal(imageProduct.imageCacheEvidence.sha256,imageHash);
 if(savedKey===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=savedKey;
 const policy={...defaults,maxCreditsPerCalendarMonth:70};
 assert.equal((await reserveCredits(policy,{key:'first',accountRemaining:10000})).limit,60);
 assert.equal((await reserveCredits(policy,{key:'second',accountRemaining:10000})).limit,10);
 await assert.rejects(reserveCredits(policy,{key:'third',accountRemaining:10000}),/积分上限/);
 const ledger=await readLedger();assert.equal(Object.values(Object.values(ledger.periods)[0].reservations).reduce((n,r)=>n+r.amount,0),70);
 await assert.rejects(reserveCredits({...policy,maxCreditsPerCalendarMonth:200},{key:'account-low',accountRemaining:5001}),/保留额度/);
}finally{if(savedKey===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=savedKey;process.chdir(root);await fs.rm(temp,{recursive:true,force:true})}
console.log('PASS: exact official JSON SKU and family identity, source colour/dimensions, shared family reads, time-billed sessions, authoritative receipts, session cleanup, durable monthly caps and account reserves.');
