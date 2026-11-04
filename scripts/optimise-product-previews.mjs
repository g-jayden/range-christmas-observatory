import fs from 'node:fs/promises';
import {readDecorations,loadDecorationDetails} from '../server/decorations.mjs';
import {readLights,loadLightingDetails} from '../server/lights.mjs';
import {readThemes,loadThemeDetails} from '../server/themes.mjs';
import {auditTaxonomy} from '../server/taxonomy-audit.mjs';
import {readOriginalPages,selectOriginals,applyOriginal} from '../server/original-images.mjs';
import {readPreviewQuality,previewProblems} from '../server/preview-quality.mjs';
import {optimiseProductPreviews} from '../server/product-previews.mjs';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {openCreditBudget} from '../server/credit-budget.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {atomicJson} from '../server/sync.mjs';
const d=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),c=await readDecorations(),l=await readLights(),t=await readThemes();
await loadDecorationDetails(c.products);await loadLightingDetails(l.products);await loadThemeDetails(t.products);
const {canonical}=await auditTaxonomy([d,c,l,t]),products=canonical.filter(p=>p.taxonomyAudit.disposition==='include'),quality=await readPreviewQuality();
await fs.mkdir('runtime',{recursive:true});await atomicJson('runtime/preview-facts-before.json',{products:products.map(p=>({sku:p.sku,variantName:p.variantName,priceGBP:p.priceGBP,originalPrice:p.originalPrice,promoText:p.promoText,departmentIds:[...p.departmentIds].sort(),firstNewObservedAt:p.firstNewObservedAt,arrivalEvidence:p.arrivalEvidence,observedAt:p.observedAt,originalImageUrl:p.originalImageUrl}))});
const budget=await openCreditBudget(await loadPolicy()),policy={...await loadPolicy(),maxSessionSeconds:60,browserCreditsPerRun:2,maxFallbackScrapesPerRun:Math.max(1,budget.limit-2),maxRunSeconds:2100},reader=await createFirecrawlBrowserReader({policy,budget});let success=false,report;
try{
 const gaps=products.filter(p=>!p.displayImage&&!(p.originalImages||[]).length&&(p.images||[]).length>1&&(previewProblems(quality.entries[p.imageCacheEvidence?.sha256]||{}).length||p.originalImages?.find(g=>g.url===p.originalImageUrl)?.thumbnail!==p.imageCacheEvidence?.sourceUrl)),families=new Map;
 for(const p of gaps){const url=p.sourceUrl.split('#')[0].replace(/\/$/,'');if(!families.has(url))families.set(url,[]);families.get(url).push(p);}
 const urls=[...families.keys()],buckets=new Map;let restored=0,sourceBatches=0;
 for(let offset=0;offset<urls.length;offset+=240){const group=urls.slice(offset,offset+240),rows=await reader.batchDocuments(readOriginalPages,{families:group.map(url=>({url})),concurrency:12});sourceBatches++;if(rows.length!==group.length||new Set(rows.map(r=>r.url)).size!==group.length)throw Error('SKU gallery repair did not reconcile');
  for(const row of rows)for(const p of families.get(row.url)){const saved=selectOriginals(p,row);if(!saved)continue;const key=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(key))buckets.set(key,await fs.readFile('web/original-image-map/'+key+'.json','utf8').then(JSON.parse).catch(()=>({})));buckets.get(key)[p.sku]=saved;applyOriginal(p,saved);restored++;}
  for(const [key,bucket]of buckets)await atomicJson('web/original-image-map/'+key+'.json',bucket);
  console.log(JSON.stringify({phase:'preview-exact-SKU-gallery-repair',families:Math.min(offset+240,urls.length),total:urls.length,restored,sourceBatches}));
 }
 report=await optimiseProductPreviews(products,{reader,maxBatches:Math.min(45,Math.max(0,policy.maxFallbackScrapesPerRun-sourceBatches-1)),batchSize:320,maxCandidates:5,prioritySkus:['1492333','1459857','474493','3414647']});success=report.pending===0;
}finally{
 await reader.close();const native=reader.metrics();await budget.settle({credits:native.firecrawlCredits,receipt:native.receipt,report:{mode:'whole-product-previews',success,at:new Date().toISOString(),...report,native}});await fs.mkdir('runtime',{recursive:true});await atomicJson('runtime/preview-collection-proof.json',{success,...report,native});console.log(JSON.stringify({phase:'preview-billing',success,...native}));
}
if(!success)process.exitCode=1;
