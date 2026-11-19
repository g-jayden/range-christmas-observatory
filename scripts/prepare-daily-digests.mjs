import {rebuildStoredRangeViews} from '../server/rebuild-range-views.mjs';
import {reportProductEvidence,mergeReportProduct} from '../server/report-product-evidence.mjs';
import {digestNativeOriginal} from '../server/digest-native-original.mjs';
import {catalogueIdentityIndex} from '../server/catalogue-identities.mjs';
import {applyRangeNativeIndex} from '../server/range-native-index.mjs';
import {publishBqCommittedEvidence} from '../server/bq-committed-evidence.mjs';
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {control} from '../server/cloud-client.mjs';import {createCatalogueReport} from '../server/catalogue-report.mjs';import {productSize,productRetailer} from '../web/product-facts.mjs';
const range=await rebuildStoredRangeViews({persist:false,includeProducts:true}),rangeBySku=new Map((range.products||[]).map(p=>[String(p.sku),p]));
const prepared=[],failures=[],cache=new Map();let bqPrepared=false;
async function json(relative,root='web'){const key=root+'/'+relative;if(!cache.has(key))cache.set(key,fs.readFile(key,'utf8').then(JSON.parse));return cache.get(key);}
async function exactProduct(candidate){
 const id=productRetailer(candidate),dep=candidate.taxonomyAudit?.primary||candidate.department||candidate.kind;let source,p;
 if(id==='the-range'){p=rangeBySku.get(String(candidate.sku));source=range;}
 else{
  let root='web';
  if(id==='bq'){if(!bqPrepared){await publishBqCommittedEvidence({outputRoot:'runtime/digest-evidence'});bqPrepared=true;}root='runtime/digest-evidence';}
  source=await json(id+'/catalogue.json',root);if(source.departmentShards?.[dep])source=await json(source.departmentShards[dep],root);
  p=source.products.find(p=>String(p.sku)===String(candidate.sku)||p.aliasSkus?.includes(String(candidate.sku)));
  if(!p&&id==='bq')p=(await json('bq/details/'+String(candidate.sku).slice(-2)+'.json',root))[candidate.sku];
  if(p?.detailsUrl)p=mergeReportProduct(p,(await json(p.detailsUrl,root))[p.sku]);
 }
 if(!p)throw Error('Current exact product absent: '+id+':'+candidate.sku);
 const acceptance=reportProductEvidence(p,candidate,source,{retailerId:id});if(!acceptance.accepted)throw Error('Exact-SKU evidence '+id+':'+candidate.sku+'; '+acceptance.reasons.join(', '));
 if(id==='the-range')for(const name of ['new-original-recovery.json','range-native-index.json'])applyRangeNativeIndex([p],await json(name).catch(e=>{if(e.code==='ENOENT')return {entries:{}};throw e;}));
 return p;
}
let plan;
if(process.env.DIGEST_TEST_OWNER==='true'){
 const d=await json('du/catalogue.json'),selected=[];
 for(const dep of ['du-tree','du-wreath'])for(const p of d.products.filter(p=>p.department===dep&&p.inStock&&p.detailsReady&&p.originalCachedImageUrl&&!p.classificationEvidence?.requiresReview).slice(0,dep==='du-tree'?9:1))selected.push(await exactProduct(p));
 if(selected.length<2)throw Error('Real verified owner test products unavailable');
 plan=await control('/internal/digest-owner-test',{products:selected,requestId:'owner-pdf-'+(process.env.GITHUB_RUN_ID||'local')+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1')});
}else plan=await control('/internal/digest-plan',{});
if(plan.waiting.length)console.log('::warning::Pending current source verification: '+[...new Set(plan.waiting.flatMap(w=>w.retailers.map(r=>r.retailerId)))].join(', ')+'; verified retailers are processed independently.');
for(const originalGroup of plan.plans){
 try{
  const products=[],items=[],native=new Map(),verifiedKeys=[];
  // Each original is measured independently. One refused or conflicting SKU
  // remains queued without discarding the other verified native photos.
  for(const candidate of originalGroup.products){
   try{
    const p=await exactProduct(candidate),{bytes,source,sha256}=await digestNativeOriginal(p);
    native.set(p,bytes);products.push(p);verifiedKeys.push(candidate.digestProductKey);
    items.push({key:candidate.digestProductKey,sku:candidate.sku,retailerId:productRetailer(p),sourceUrl:p.sourceUrl,priceGBP:p.priceGBP,size:productSize(p),imageSourceUrl:source,imageSha256:sha256,sourceObservedAt:p.observedAt});
   }catch(e){failures.push({plan:originalGroup.id,key:candidate.digestProductKey,error:String(e.message).slice(0,250)});}
  }
  if(!products.length)continue;
  const group=products.length===originalGroup.products.length?originalGroup:await control('/internal/digest-subset',{planId:originalGroup.id,readyKeys:verifiedKeys});
  const identity=catalogueIdentityIndex(products);for(const p of products){const canonical=identity.canonical[productRetailer(p)+':'+p.sku];if(canonical)p.canonicalSku=canonical;}
  const dir='web/reports/'+group.id;await fs.mkdir(dir,{recursive:true});
  const bytes=await createCatalogueReport(products,{output:dir+'/NEW.pdf',readImage:p=>native.get(p)}),manifest={version:'daily-native-pdf-v1',planId:group.id,day:group.day,items,pdf:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}};
  await fs.writeFile(dir+'/manifest.json',JSON.stringify(manifest));prepared.push({id:group.id,products:items.length,bytes:bytes.length,deferred:group.deferredProducts||0});
 }catch(e){failures.push({plan:originalGroup.id,error:String(e.message).slice(0,250)});}
}
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/daily-digest-outbox.private.json',JSON.stringify({prepared,failures}));
if(failures.length)console.log('::warning::Some product evidence is still queued; verified products can be delivered without marking failed products sent.');
console.log(JSON.stringify({phase:'Prepare consolidated native PDF',prepared:prepared.map(({products,bytes,deferred})=>({products,bytes,deferred})),sourceWaits:plan.waiting.length,failures,firecrawlCredits:0}));
