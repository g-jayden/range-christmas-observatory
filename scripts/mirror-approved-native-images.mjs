import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {nativeSourceUrl,productRetailer} from '../web/product-facts.mjs';
import {createPaidNativeOriginals,exactPaidNativeTarget} from '../server/paid-native-originals.mjs';
import {rebuildStoredRangeViews} from '../server/rebuild-range-views.mjs';
import {applyRangeNativeIndex} from '../server/range-native-index.mjs';
import {mergeReportProduct} from '../server/report-product-evidence.mjs';
import {publishBqCommittedEvidence} from '../server/bq-committed-evidence.mjs';
import {applySavedRetailerReview} from '../server/saved-retailer-reviews.mjs';
const tracked=new Set(execFileSync('git',['ls-files','web/images'],{encoding:'utf8',maxBuffer:33554432}).trim().split('\n')),read=p=>fs.readFile('web/'+p,'utf8').then(JSON.parse),products=[],byKey=new Map();
const range=await rebuildStoredRangeViews({persist:false,includeProducts:true,verifyImageFiles:false});if(!range.rebuilt)throw Error('Canonical Range source required');
for(const name of ['range-native-index.json','new-original-recovery.json'])applyRangeNativeIndex(range.products,await read(name).catch(()=>({entries:{}})));products.push(...range.products.filter(p=>p.taxonomyAudit?.disposition==='include'));
for(const retailer of ['asda','ms','bm','hb','du','nx','jl','mt','bq','ar']){
 let root='web';if(retailer==='bq'){root='runtime/native-recovery-evidence';await publishBqCommittedEvidence({outputRoot:root});}
 const json=p=>fs.readFile(root+'/'+p,'utf8').then(JSON.parse),detailCache=new Map(),d=await json(retailer+'/catalogue.json');let rows=d.products||[];
 if(d.departmentShards)rows=(await Promise.all([...new Set(Object.values(d.departmentShards))].map(p=>json(p)))).flatMap(s=>s.products||[]);
 const reviews=['asda','du'].includes(retailer)?await json(retailer+'/reviews.json'):null;
 rows=await Promise.all(rows.map(async p=>{if(p.detailsUrl){if(!detailCache.has(p.detailsUrl))detailCache.set(p.detailsUrl,json(p.detailsUrl));p=mergeReportProduct(p,(await detailCache.get(p.detailsUrl))[p.sku]);}if(reviews)applySavedRetailerReview(p,reviews[p.sku],retailer);return p;}));
 products.push(...rows.filter(p=>p.sourceListed!==false&&p.taxonomyAudit?.disposition!=='exclude'));
}
for(const p of products)byKey.set(productRetailer(p)+':'+p.sku,p);
 const recovery=await createPaidNativeOriginals(),issues=[],checked=new Set;let reused=0,recovered=0;
try{for(const p of byKey.values()){
 const source=nativeSourceUrl(p),declared=p.originalImageEvidence,exported=p.nativeExportEvidence,validExport=exported?.sourceUrl===source&&String(exported.selectedSku)===String(p.sku)&&exported.width===declared?.width&&exported.height===declared?.height&&exported.sourceVersion===declared?.sourceVersion,proof=validExport?{...declared,sha256:exported.sha256}:declared;
 if(!source||checked.has(source))continue;checked.add(source);
 if(p.originalCachedImageUrl&&proof?.sourceUrl===source&&/^[a-f0-9]{64}$/.test(proof.sha256||'')&&p.originalCachedImageUrl.includes(proof.sha256+'.')&&tracked.has('web/'+p.originalCachedImageUrl)){reused++;continue;}
 try{exactPaidNativeTarget(p);await recovery.read(p);recovered++;}catch(e){issues.push({retailerId:productRetailer(p),sku:p.sku,source,error:String(e.message).slice(0,200)});}
}}finally{await recovery.close();}
const status={checkedAt:new Date().toISOString(),exactProducts:byKey.size,uniqueSelectedOriginals:checked.size,reusedCommittedNativeMirrors:reused,recovered,issues,sourceDirectoriesRequested:0,...recovery.metrics()};await fs.writeFile('web/native-original-recovery-status.json',JSON.stringify(status));console.log(JSON.stringify({phase:'All retailers native originals: free first, paid only for exact missing images',...status,issues:issues.slice(0,12)}));
