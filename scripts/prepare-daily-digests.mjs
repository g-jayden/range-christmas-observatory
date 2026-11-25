import {productNames,PDF_LAYOUT_VERSION} from '../web/product-names.mjs';
import {applySavedRetailerReview} from '../server/saved-retailer-reviews.mjs';
import {nativeSourceUrl} from '../web/product-facts.mjs';
import {exactNativeGalleryMember} from '../server/native-gallery-identity.mjs';
import {rebuildStoredRangeViews} from '../server/rebuild-range-views.mjs';
import {reportProductEvidence,mergeReportProduct,reportFieldProduct} from '../server/report-product-evidence.mjs';
import {createPaidNativeOriginals} from '../server/paid-native-originals.mjs';
import {catalogueIdentityIndex} from '../server/catalogue-identities.mjs';
import {applyRangeNativeIndex} from '../server/range-native-index.mjs';
import {prepareBqInternalEvidence} from '../server/bq-committed-evidence.mjs';
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {control} from '../server/cloud-client.mjs';import {createCatalogueReport} from '../server/catalogue-report.mjs';import {productSize,productRetailer} from '../web/product-facts.mjs';
const range=await rebuildStoredRangeViews({persist:false,includeProducts:true,verifyImageFiles:false}),rangeBySku=new Map((range.products||[]).map(p=>[String(p.sku),p]));
const prepared=[],failures=[],cache=new Map();let bqPrepared=false;const nativeRecovery=await createPaidNativeOriginals();
async function json(relative,root='web'){const key=root+'/'+relative;if(!cache.has(key))cache.set(key,fs.readFile(key,'utf8').then(JSON.parse));return cache.get(key);}
async function exactProduct(candidate){
 const id=productRetailer(candidate),dep=candidate.taxonomyAudit?.primary||candidate.department||candidate.kind;let source,p;
 if(id==='the-range'&&candidate.collectionId==='spring'){source=await json('spring/catalogue.json');p=source.products.find(p=>String(p.sku)===String(candidate.sku));}
 else if(id==='the-range'){p=rangeBySku.get(String(candidate.sku));source=range;}
 else{
  let root='web';
  if(id==='bq'){if(!bqPrepared){await prepareBqInternalEvidence({purpose:'report-candidates'});bqPrepared=true;}root='runtime/digest-evidence';}
  source=await json(id+'/catalogue.json',root);if(source.departmentShards?.[dep])source=await json(source.departmentShards[dep],root);
  p=source.products.find(p=>String(p.sku)===String(candidate.sku)||p.aliasSkus?.includes(String(candidate.sku)));
  if(!p&&id==='bq')p=(await json('bq/details/'+String(candidate.sku).slice(-2)+'.json',root))[candidate.sku];
  if(p?.detailsUrl)p=mergeReportProduct(p,(await json(p.detailsUrl,root))[p.sku]);
 }
 if(!p)throw Error('Current exact product absent: '+id+':'+candidate.sku);
 if(id==='asda'||id==='du')applySavedRetailerReview(p,(await json(id+'/reviews.json'))[p.sku],id);
 const acceptance=reportProductEvidence(p,candidate,source,{retailerId:id});if(!acceptance.accepted)throw Error('Exact-SKU evidence '+id+':'+candidate.sku+'; '+acceptance.reasons.join(', '));
 p=reportFieldProduct(p,acceptance);
 if(id==='the-range')for(const name of ['new-original-recovery.json','range-native-index.json'])applyRangeNativeIndex([p],await json(name).catch(e=>{if(e.code==='ENOENT')return {entries:{}};throw e;}));
 return p;
}
const nativeIndex=await json('range-native-index.json').catch(()=>({entries:{}})),nativeRecoveryIndex=await json('new-original-recovery.json').catch(()=>({entries:{}})),nativeGaps=[];Object.assign(nativeIndex.entries,nativeRecoveryIndex.entries);for(const p of range.products||[]){if(p.taxonomyAudit?.disposition!=='include')continue;const url=nativeSourceUrl(p);if(p.originalImages?.some(g=>g.url===url&&exactNativeGalleryMember(p,g))&&!nativeIndex.entries?.[url]?.ok)nativeGaps.push({sku:p.sku,url,sourceUrl:p.sourceUrl});}console.log(JSON.stringify({phase:'Read-only exact native gap diagnosis',missing:[...new Map(nativeGaps.map(p=>[p.url,p])).values()].slice(0,25),sourceRequests:0,firecrawlCredits:0}));
let plan;
if(process.env.DIGEST_REPAIR_COMBINED==='true'){
 const parents=['a1cc4ca4c82fdafee1d7bd315b92e2bf93d7cf91444bfd79dbd2f5815372021a','ec753a24530cbe8914a6190c9ddd2fe0609b88b9e4f5e57818384439626879ce','ae27288802b6b22134701dfde8fa16a0955b3724c8d333f7b2deeb1f31ecf60f'],manifests=await Promise.all(parents.map(id=>json('reports/'+id+'/manifest.json')));
 if(manifests.some(m=>m.day!=='2026-11-19'||m.version!=='daily-native-pdf-v1'))throw Error('Unexpected original report evidence');
 const products=manifests.flatMap(m=>m.items.map(p=>({...p,digestProductKey:p.key})));if(products.length!==76||new Set(products.map(p=>p.digestProductKey)).size!==76)throw Error('Previously delivered report coverage changed');
 const id=createHash('sha256').update('combined-source-conflict-correction-v1/'+parents.join('/')).digest('hex');plan={day:'2026-11-19',plans:[{id,day:'2026-11-19',products,correction:true,parents}],waiting:[]};
}else if(process.env.DIGEST_TEST_OWNER==='true'){
 const d=await json('du/catalogue.json'),selected=[];
 for(const dep of ['du-tree','du-wreath'])for(const p of d.products.filter(p=>p.department===dep&&p.inStock&&p.detailsReady&&p.originalCachedImageUrl&&!p.classificationEvidence?.requiresReview).slice(0,dep==='du-tree'?9:1))selected.push(await exactProduct(p));
 if(selected.length<2)throw Error('Real verified owner test products unavailable');
 plan=await control('/internal/digest-owner-test',{products:selected,requestId:'owner-pdf-'+(process.env.GITHUB_RUN_ID||'local')+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1')});
}else plan=await control('/internal/digest-plan',{});
if(plan.waiting.length)console.log('::warning::The complete daily PDF is waiting for all subscribed sources: '+[...new Set(plan.waiting.flatMap(w=>w.retailers.map(r=>r.retailerId)))].join(', ')+'; no retailer subset will be sent.');
for(const originalGroup of plan.plans){
 try{
  const products=[],items=[],native=new Map(),verifiedKeys=[];
  // Each original is measured independently. One refused or conflicting SKU
  // remains queued without discarding the other verified native photos.
  for(const candidate of originalGroup.products){
   try{
    const p=await exactProduct(candidate),{bytes,source,sha256}=await nativeRecovery.read(p);
    native.set(p,bytes);products.push(p);verifiedKeys.push(candidate.digestProductKey);
    items.push({key:candidate.digestProductKey,sku:candidate.sku,retailerId:productRetailer(p),names:productNames(p),sourceUrl:p.sourceUrl,priceGBP:p.priceGBP,size:productSize(p),imageSourceUrl:source,imageSha256:sha256,sourceObservedAt:p.observedAt,...(p.reportFieldEvidence?{reportFieldEvidence:p.reportFieldEvidence}:{})});
   }catch(e){failures.push({plan:originalGroup.id,key:candidate.digestProductKey,error:String(e.message).slice(0,250)});}
  }
  if(!products.length)continue;
  if(originalGroup.correction&&products.length!==originalGroup.products.length)throw Error('Combined correction must verify every originally delivered product before publication');
  if(products.length!==originalGroup.products.length){failures.push({plan:originalGroup.id,error:'Complete daily PDF is waiting for every planned product; no partial report was prepared',ready:products.length,expected:originalGroup.products.length});continue;}
  const group=originalGroup;
  const identity=catalogueIdentityIndex(products);for(const p of products){const canonical=identity.canonical[productRetailer(p)+':'+p.sku];if(canonical)p.canonicalSku=canonical;}
  const dir='web/reports/'+group.id;await fs.mkdir(dir,{recursive:true});
  const bytes=await createCatalogueReport(products,{output:dir+'/NEW.pdf',readImage:p=>native.get(p)}),manifest={...(group.correction?{correction:true,originalReports:group.parents}:{}),version:'daily-native-pdf-v1',layoutVersion:PDF_LAYOUT_VERSION,planId:group.id,day:group.day,items,pdf:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}};
  await fs.writeFile(dir+'/manifest.json',JSON.stringify(manifest));prepared.push({id:group.id,products:items.length,bytes:bytes.length,deferred:group.deferredProducts||0});
 }catch(e){failures.push({plan:originalGroup.id,error:String(e.message).slice(0,250)});}
}
await nativeRecovery.close();
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/daily-digest-outbox.private.json',JSON.stringify({prepared,failures}));
if(failures.length)console.log('::warning::The complete affected report remains queued until every planned product is verified; no partial PDF is sent.');
console.log(JSON.stringify({phase:'Prepare consolidated native PDF',prepared:prepared.map(({products,bytes,deferred})=>({products,bytes,deferred})),sourceWaits:plan.waiting.length,failures,firecrawlCredits:0}));
