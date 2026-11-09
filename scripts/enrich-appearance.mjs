import {createHash as asdaReviewHash} from 'node:crypto';
import {auditTaxonomy} from '../server/taxonomy-audit.mjs';
import {reconcileVerifiedEvidence,saveVerifiedRegistry} from '../server/verified-evidence.mjs';
import {restoreObservedImages} from '../server/direct-image-repair.mjs';
import {productEvidenceHealth} from '../server/product-evidence-health.mjs';
import {readThemes,loadThemeDetails,publishThemes,borrowThemeEvidence} from '../server/themes.mjs';
import {restoreOriginalImages} from '../server/original-images.mjs';
import {applySourceRepairs,applySourceOriginalRepairs} from '../server/source-repairs.mjs';
import {readLedger} from '../server/credit-budget.mjs';
import {readLights,loadLightingDetails,publishLights} from '../server/lights.mjs';
import fs from 'node:fs/promises';
import {enrichProducts,selectGalleryImages} from '../server/enrich-appearance.mjs';
import {atomicJson} from '../server/sync.mjs';
import {digest} from '../server/collection-policy.mjs';
import {readDecorations,loadDecorationDetails,enrichDecorations,publishDecorations,publishDecorationStatus,decorationReadiness} from '../server/decorations.mjs';
import {DEPARTMENTS,scopeProducts} from '../web/catalogue-model.mjs';
import {materialFacts} from '../server/appearance.mjs';
import {buildMailAssets,MAIL_CARD_VERSION,mailHeightLabel} from '../server/mail-assets.mjs';

const d=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));
await atomicJson('web/collection-ledger.json',await readLedger());
const sourceRepairs={trees:await applySourceRepairs(d.products),treeOriginals:await applySourceOriginalRepairs(d.products)};
d.appearanceAudit=await enrichProducts(d.products);
const s=JSON.parse(await fs.readFile('web/status.json','utf8'));
console.log(JSON.stringify(d.appearanceAudit));
const decorations=await readDecorations();
const beforeIds=decorations.products.map(p=>p.sku).sort(),sourceObservedAt=decorations.observedAt;
const oldDepartments=new Map(decorations.products.map(p=>[p.sku,p.department]));
if(decorations.products.length){
 await loadDecorationDetails(decorations.products);
 sourceRepairs.decorations=await applySourceRepairs(decorations.products);
 sourceRepairs.decorationOriginals=await applySourceOriginalRepairs(decorations.products);
 await selectGalleryImages(decorations.products);
 await enrichDecorations(decorations.products,{infer:false});
 for(const p of decorations.products)if(p.specifications)p.material=materialFacts(p.specifications,p.sourceDescription||'').label;
 decorationReadiness(decorations);
 const priorStatus=await fs.readFile('web/decorations-status.json','utf8').then(JSON.parse).catch(()=>({}));
 await restoreOriginalImages(decorations.products);await publishDecorations(decorations);
 await publishDecorationStatus(decorations,priorStatus.native||{});
}
if(JSON.stringify(beforeIds)!==JSON.stringify(decorations.products.map(p=>p.sku).sort())||sourceObservedAt!==decorations.observedAt)throw Error('Local reclassification must retain every SKU and its source observation date');
const canonical=new Map(decorations.products.map(p=>[p.sku,p]));
for(const p of d.products){const current=canonical.get(p.sku);if(current)for(const k of ['department','departmentIds','classificationEvidence'])p[k]=current[k];}
await restoreOriginalImages(d.products);d.revision=digest({observedAt:d.observedAt,products:d.products,sources:d.sources,excluded:d.excluded});
if(d.browserImageAudit)d.browserImageAudit.catalogueRevision=d.revision;
Object.assign(s,{revision:d.revision,appearanceAudit:d.appearanceAudit});
if(s.browserImageAudit)s.browserImageAudit.catalogueRevision=d.revision;
await atomicJson('web/catalogue.json',d);await atomicJson('web/status.json',s);
const lights=await readLights();if(lights.products.length){await loadLightingDetails(lights.products);sourceRepairs.lights=await applySourceRepairs(lights.products);sourceRepairs.lightOriginals=await applySourceOriginalRepairs(lights.products);await restoreOriginalImages(lights.products);await publishLights(lights);}
const themes=await readThemes();if(themes.products.length){await loadThemeDetails(themes.products);borrowThemeEvidence(themes,[decorations,lights,d]);sourceRepairs.themes=await applySourceRepairs(themes.products);sourceRepairs.themeOriginals=await applySourceOriginalRepairs(themes.products);await restoreOriginalImages(themes.products);await publishThemes(themes);}
// Hydrate saved exact-SKU descriptions before auditing all four source sets.
await loadDecorationDetails(decorations.products);await loadLightingDetails(lights.products);await loadThemeDetails(themes.products);
const sharedEvidence=reconcileVerifiedEvidence([d,decorations,lights,themes]);await saveVerifiedRegistry([d,decorations,lights,themes].flatMap(s=>s.products));console.log(JSON.stringify({phase:'shared-verified-product-evidence',...sharedEvidence,records:undefined}));
const recoveredImages=await restoreObservedImages([d,decorations,lights,themes]);s.browserImageAudit=d.browserImageAudit;console.log(JSON.stringify({phase:'verified-browser-image-recovery',...recoveredImages,records:undefined}));
const recoveredImageSkus=new Set(recoveredImages.records.map(p=>p.sku));if(recoveredImageSkus.size){await enrichProducts(d.products.filter(p=>recoveredImageSkus.has(p.sku)));await enrichDecorations(decorations.products.filter(p=>recoveredImageSkus.has(p.sku)));}
const taxonomy=await auditTaxonomy([d,decorations,lights,themes]);
const evidenceHealth=productEvidenceHealth([d,decorations,lights,themes]);await atomicJson('web/product-evidence-health.json',evidenceHealth);console.log(JSON.stringify({phase:'product-evidence-health',...evidenceHealth,unresolved:undefined}));
await publishDecorations(decorations);await publishLights(lights);await publishThemes(themes);
decorationReadiness(decorations);await publishDecorationStatus(decorations,(await fs.readFile('web/decorations-status.json','utf8').then(JSON.parse)).native||{});
d.revision=digest({observedAt:d.observedAt,products:d.products,sources:d.sources,excluded:d.excluded});s.revision=d.revision;
await atomicJson('web/catalogue.json',d);await atomicJson('web/status.json',s);
await atomicJson('web/source-repairs-proof.json',sourceRepairs);console.log(JSON.stringify({phase:'saved-source-repairs',...sourceRepairs}));
const products=new Map([...decorations.products,...lights.products,...themes.products,...d.products].map(p=>[p.sku,p]));
for(const p of lights.products){const prior=products.get(p.sku);if(prior&&prior!==p)prior.departmentIds=[...new Set([...(prior.departmentIds||[]),...p.departmentIds])];}
let arrivals;try{arrivals=JSON.parse(await fs.readFile('web/new-arrivals.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(arrivals){
 let changed=false;
 for(const p of arrivals.products||[]){const current=products.get(p.sku);if(!current)continue;for(const k of ['previewImage','previewAudit','department','departmentIds','classificationEvidence','taxonomyAudit','priceGBP','originalPrice','promoText','observedAt'])if(JSON.stringify(p[k])!==JSON.stringify(current[k])){p[k]=current[k];changed=true;}}
 if(changed){arrivals.revision=digest({at:arrivals.observedAt,products:arrivals.products,history:arrivals.history,availableSkus:arrivals.availableSkus});await atomicJson('web/new-arrivals.json',arrivals);}
}
const moved=decorations.products.filter(p=>oldDepartments.get(p.sku)!==p.department).map(p=>({sku:p.sku,from:oldDepartments.get(p.sku),to:p.department}));
await atomicJson('web/classification-proof.json',{classifiedAt:new Date().toISOString(),sourceObservedAt,departmentCount:DEPARTMENTS.length,productsBefore:beforeIds.length,productsAfter:decorations.products.length,sourceRequestsMade:false,firecrawlCredits:0,reclassified:moved,presents:{all:scopeProducts(decorations.products,'presents').length,new:scopeProducts(decorations.products,'presents','new').length,today:scopeProducts(decorations.products,'presents','today').length}});
let cardsUpdated=0;
for(const name of await fs.readdir('web/mail-assets').catch(()=>[])){
 const dir='web/mail-assets/'+name,manifest=await fs.readFile(dir+'/manifest.json','utf8').then(JSON.parse).catch(()=>null),p=products.get(name);
 if(!manifest||!p||p.taxonomyAudit?.disposition!=='include'||manifest.material===p.material&&manifest.priceGBP===p.priceGBP&&manifest.originalPrice===p.originalPrice&&manifest.promoText===p.promoText&&manifest.cardVersion===MAIL_CARD_VERSION&&manifest.height===mailHeightLabel(p)&&JSON.stringify(manifest.colors)===JSON.stringify(p.colorValues)&&manifest.department===(p.department||p.kind)&&(!p.displayImage||manifest.original.sha256===p.displayImage.sha256))continue;
 const original=p.displayImage?.cachePath||'mail-assets/'+name+'/'+new URL(manifest.original.url).pathname.split('/').pop();await fs.access('web/'+original);
 p.originalCachedImageUrl=original;p.originalImageUrl=p.displayImage?.sourceUrl||manifest.original.sourceUrl;
 const proof=manifest.proof?await fs.readFile(dir+'/proof.png'):null;await buildMailAssets(p,proof?.toString('base64'));cardsUpdated++;
}
console.log(JSON.stringify({savedSourceMaterialsRecomputed:decorations.products.length,reclassified:moved.length,cardsUpdated,sourceRequestsMade:false,firecrawlCredits:0}));

const asdaEvidence=await fs.readFile('web/asda/catalogue.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});const asdaReviews=await fs.readFile('web/asda/reviews.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {};throw e;});if(asdaEvidence&&(asdaEvidence.imageAudit?.version!=='2026-11-10-asda-v4'||asdaEvidence.imageAudit?.reviewRevision!==asdaReviewHash('sha256').update(JSON.stringify(asdaReviews)).digest('hex')))await import('./enrich-asda.mjs');
