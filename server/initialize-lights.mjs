import fs from 'node:fs/promises';
import {readLights,collectLightDirectory,updateLightingDetails,publishLights} from './lights.mjs';
import {readDecorations,loadDecorationDetails,publishDecorations,publishDecorationStatus} from './decorations.mjs';
import {collectDecorationDirectory} from './update-decorations.mjs';
import {catalogueSnapshot,preserveImages} from './incremental.mjs';
import {selectGalleryImages} from './enrich-appearance.mjs';
import {createFirecrawlBrowserReader} from './firecrawl-browser.mjs';
import {loadPolicy,digest} from './collection-policy.mjs';
import {openCreditBudget} from './credit-budget.mjs';
import {control,apiBase} from './cloud-client.mjs';
import {atomicJson} from './sync.mjs';

// One bounded source session initializes lighting and refreshes every existing
// catalogue price. Previously verified descriptions/photos are reused by SKU.
const policy={...await loadPolicy(),repairImagesOnly:true,imageCheckpoint:'web/lighting-image-checkpoint.json',familyBatchSize:100,familyBatchConcurrency:8,familyFetchTimeoutMs:20000,adaptiveFamilies:true,imageBodyBatchSize:250,maxFallbackScrapesPerRun:56};
const budget=await openCreditBudget(policy),reader=await createFirecrawlBrowserReader({policy,budget});let lights,error,settled=false;
try{
 const previous=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),previousDecorations=await readDecorations(),previousLights=await readLights();
 await loadDecorationDetails(previousDecorations.products);
 lights=await collectLightDirectory(reader,previousLights,[previousDecorations,previous]);
 console.log(JSON.stringify({phase:'lighting-root-complete',products:lights.products.length}));
 const trees=(await catalogueSnapshot({previous,reader,policy,forceFresh:true})).snapshot;preserveImages(previous,trees);
 console.log(JSON.stringify({phase:'tree-and-skirt-prices-complete',products:trees.products.length}));
 const decorations=await collectDecorationDirectory(reader,previousDecorations);await loadDecorationDetails(decorations.products);
 console.log(JSON.stringify({phase:'decoration-prices-complete',products:decorations.products.length}));
 await reader.closeBrowser();
 lights.detailAudit=await updateLightingDetails(lights,reader,{shared:[decorations,trees]});await selectGalleryImages(lights.products);
 const prior={entries:{...previous.browserImageAudit?.entries,...previousDecorations.browserImageAudit?.entries,...previousLights.browserImageAudit?.entries}};
 // No re-fetch or image analysis for unchanged photographs, across every scope.
 const all=[...trees.products,...decorations.products,...lights.products];const imageAudit=await reader.auditImages(all,prior,{bodyBatchSize:250});
 trees.browserImageAudit=imageAudit;decorations.browserImageAudit=imageAudit;lights.browserImageAudit=imageAudit;
 await reader.close();const native=reader.metrics();await budget.settle({credits:native.firecrawlCredits,receipt:native.receipt,report:{mode:'lights-initialization-and-all-source-prices',native,products:lights.products.length,detailAudit:lights.detailAudit}});settled=true;
 await publishLights(lights,native);if(!lights.operationalReady)throw Error('Lighting catalogue incomplete: '+JSON.stringify(lights.coverage));
 if(!previousLights.baselineReady&&apiBase){await control('/internal/extend-baseline',{scope:'christmas-lights-v1',records:lights.products.map(p=>({sku:p.sku,everNew:p.arrivalEvidence==='initial-baseline'&&Boolean(p.everNew||p.newStatus)})),observedAt:lights.observedAt});}
 lights.baselineReady=true;await publishLights(lights,native);
 trees.revision=digest({at:trees.observedAt,products:trees.products});await atomicJson('web/catalogue.json',trees);const status=JSON.parse(await fs.readFile('web/status.json','utf8'));await atomicJson('web/status.json',{...status,revision:trees.revision,stats:trees.stats,lastSuccess:trees.observedAt,firecrawlCredits:native.firecrawlCredits});
 await publishDecorations(decorations);await publishDecorationStatus(decorations,{});
 const sets=[trees,decorations,lights],bySku=new Map();for(const s of sets)for(const p of s.products)bySku.set(p.sku,p);
 const proof={success:true,observedAt:lights.observedAt,sources:lights.sources,lightingCoverage:lights.coverage,allPrices:{uniqueSkus:bySku.size,reduced:[...bySku.values()].filter(p=>Number.isInteger(p.originalPrice)&&p.originalPrice>Math.round(p.priceGBP*100)).length,fields:['price','originalPrice','promoText'],inferredDiscounts:false},native,emailsSent:0,initialBaselineExcluded:true};await atomicJson('web/lights-initialization-proof.json',proof);console.log(JSON.stringify(proof));
}catch(e){error=e;await reader.close().catch(()=>{});const native=reader.metrics();if(!settled)await budget.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'lights-initialization',success:false,error:e.message,native}});if(lights)await publishLights(lights,native);console.error(String(e.message).replace(/fc-[\w-]+/g,'[redacted]'));process.exitCode=1;}
finally{await reader.close().catch(()=>{})}
