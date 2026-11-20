import{savedNativeArchivePending}from'../server/native-archive-gate.mjs';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {nativeSourceUrl,productRetailer} from '../web/product-facts.mjs';
import {createPaidNativeOriginals,exactPaidNativeTarget} from '../server/paid-native-originals.mjs';
import {rebuildStoredRangeViews} from '../server/rebuild-range-views.mjs';
import {applyRangeNativeIndex} from '../server/range-native-index.mjs';
import {rangeNativeTargets} from '../server/range-native-plan.mjs';
import {mergeReportProduct} from '../server/report-product-evidence.mjs';
import {publishBqCommittedEvidence} from '../server/bq-committed-evidence.mjs';
import {applySavedRetailerReview} from '../server/saved-retailer-reviews.mjs';
import {recoverNativeBatch,prioritizePendingOriginals,publishedNativeCandidates} from '../server/native-recovery-batch.mjs';
import {atomicJson} from '../server/sync.mjs';
const tracked=new Set(execFileSync('git',['ls-files','web/images'],{encoding:'utf8',maxBuffer:33554432}).trim().split('\n')),read=p=>fs.readFile('web/'+p,'utf8').then(JSON.parse),products=[],byKey=new Map();
if(await savedNativeArchivePending(await read('collection-ledger.json'),{token:process.env.GITHUB_TOKEN})){await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/native-archive-deferred.json',JSON.stringify({runId:process.env.GITHUB_RUN_ID,archiveRun:44707707847}));if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'native_deferred=true\n');console.log(JSON.stringify({phase:'Reuse durable native archive before any new capture',deferred:true,archiveRun:44707707847,sourceRequests:0,firecrawlCredits:0}));process.exit(0);}
execFileSync(process.execPath,['scripts/discover-range-image-galleries.mjs'],{env:process.env,stdio:'inherit'});
const range=await rebuildStoredRangeViews({persist:false,includeProducts:true,verifyImageFiles:false});if(!range.rebuilt)throw Error('Canonical Range source required');
const rangeBulkSources=rangeNativeTargets(range.products);
for(const name of ['range-native-index.json','new-original-recovery.json'])applyRangeNativeIndex(range.products,await read(name).catch(()=>({entries:{}})));products.push(...range.products.filter(p=>p.taxonomyAudit?.disposition==='include'));
for(const retailer of ['asda','ms','bm','hb','du','nx','jl','mt','bq','ar']){
 let root='web';if(retailer==='bq'){root='runtime/native-recovery-evidence';await publishBqCommittedEvidence({outputRoot:root});}
 const json=p=>fs.readFile(root+'/'+p,'utf8').then(JSON.parse),detailCache=new Map(),d=await json(retailer+'/catalogue.json');let rows=d.products||[];
 if(d.departmentShards)rows=(await Promise.all([...new Set(Object.values(d.departmentShards))].map(p=>json(p)))).flatMap(s=>s.products||[]);
 const reviews=['asda','du'].includes(retailer)?await json(retailer+'/reviews.json'):null;
 rows=await Promise.all(rows.map(async p=>{if(p.detailsUrl){if(!detailCache.has(p.detailsUrl))detailCache.set(p.detailsUrl,json(p.detailsUrl));p=mergeReportProduct(p,(await detailCache.get(p.detailsUrl))[p.sku]);}if(reviews)applySavedRetailerReview(p,reviews[p.sku],retailer);return p;}));
 products.push(...publishedNativeCandidates(rows));
}
for(const p of products)byKey.set(productRetailer(p)+':'+p.sku,p);
const recovery=await createPaidNativeOriginals({skipPaidRetailers:['the-range']}),checked=new Set(),entries=[];
for(const p of byKey.values()){const source=nativeSourceUrl(p),identity=source||productRetailer(p)+':'+p.sku;if(checked.has(identity))continue;checked.add(identity);entries.push({retailerId:productRetailer(p),sku:p.sku,source:source||null,product:p});}
const previous=await read('native-original-recovery-status.json').catch(e=>{if(e.code==='ENOENT')return {};throw e;});let checkpointWrites=Promise.resolve();
await recoverNativeBatch(prioritizePendingOriginals(entries,previous),{
 reuse:async({product:p,source})=>{const saved=recovery.index.entries?.[source];if(saved?.ok&&saved.url===source&&saved.bindings?.includes(productRetailer(p)+':'+p.sku)&&/^[a-f0-9]{64}$/.test(saved.hash||'')&&saved.cachedImageUrl?.includes(saved.hash+'.')&&tracked.has('web/'+saved.cachedImageUrl)&&(!p.originalImageEvidence?.sha256||p.originalImageEvidence.sourceUrl!==source||p.originalImageEvidence.sha256===saved.hash))return true;const declared=p.originalImageEvidence,exported=p.nativeExportEvidence,validExport=exported?.sourceUrl===source&&String(exported.selectedSku)===String(p.sku)&&exported.width===declared?.width&&exported.height===declared?.height&&exported.sourceVersion===declared?.sourceVersion,proof=validExport?{...declared,sha256:exported.sha256}:declared;return Boolean(p.originalCachedImageUrl&&proof?.sourceUrl===source&&/^[a-f0-9]{64}$/.test(proof.sha256||'')&&p.originalCachedImageUrl.includes(proof.sha256+'.')&&tracked.has('web/'+p.originalCachedImageUrl));},
 recover:async({product:p,source,retailerId})=>{exactPaidNativeTarget(p);if(retailerId==='the-range'&&rangeBulkSources.has(source))throw Object.assign(Error('Exact original is assigned to the independent free-first Range native batch'),{code:'NATIVE_BULK_DEFERRED'});await recovery.read(p);},close:()=>recovery.close(),
 checkpoint:state=>{const status=structuredClone({...state,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,exactProducts:byKey.size,uniqueSelectedOriginals:checked.size,reusedCommittedNativeMirrors:state.reused,sourceDirectoriesRequested:0,rangeFreeFirstBatchStatus:'range-native-status.json',...recovery.metrics()});const next=checkpointWrites.then(async()=>{await atomicJson('web/native-original-recovery-status.json',status);console.log(JSON.stringify({phase:'Native original recovery checkpoint',processed:status.processed,total:status.total,reused:status.reused,recovered:status.recovered,issues:status.issues.length,pending:status.pending.length,complete:status.complete,deadlineReached:status.deadlineReached,...recovery.metrics()}));});checkpointWrites=next.catch(()=>{});return next;}
});
