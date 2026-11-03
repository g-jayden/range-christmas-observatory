import fs from 'node:fs/promises';
import {THEME_DEFINITIONS} from '../web/theme-model.mjs';
import {readThemes,collectThemeDirectory,updateThemeDetails,publishThemes,loadThemeDetails} from './themes.mjs';
import {readLights,loadLightingDetails,updateLightingDetails,publishLights} from './lights.mjs';
import {readDecorations,loadDecorationDetails,publishDecorations,publishDecorationStatus,notificationSnapshot} from './decorations.mjs';
import {mapOriginalImages} from './original-images.mjs';
import {createFirecrawlBrowserReader} from './firecrawl-browser.mjs';
import {loadPolicy,digest} from './collection-policy.mjs';
import {openCreditBudget} from './credit-budget.mjs';
import {atomicJson} from './sync.mjs';
import {control,apiBase} from './cloud-client.mjs';

const policy={...await loadPolicy(),repairImagesOnly:true,familyBatchSize:150,familyBatchConcurrency:8,adaptiveFamilies:true,maxFallbackScrapesPerRun:58,maxRunSeconds:2200,imageBodyBatchSize:100},budget=await openCreditBudget(policy),reader=await createFirecrawlBrowserReader({policy,budget});let themes,error,settled=false;
const trees=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),decorations=await readDecorations(),lights=await readLights(),previous=await readThemes();
try{
 await loadDecorationDetails(decorations.products);await loadLightingDetails(lights.products);await loadThemeDetails(previous.products);
 themes=await collectThemeDirectory(reader,previous,[decorations,lights,trees]);console.log(JSON.stringify({phase:'themes-source-complete',products:themes.products.length}));await reader.closeBrowser();
 // Fix malformed URLs using the display-character form already supplied by
 // the official catalogue, then require exact SKU + product-family identity.
 const malformed=lights.products.filter(p=>!p.detailsReady&&/%1[39]/i.test(p.sourceUrl)&&/¿/.test(p.variantName||''));
 const candidates=malformed.map(p=>({...p,sourceUrl:p.sourceUrl.replace(/%1[39]/gi,'%C2%BF'),detailIssue:null}));
 if(candidates.length){const temp={...lights,products:candidates};await updateLightingDetails(temp,reader,{selectedSkus:candidates.map(p=>p.sku)});for(const candidate of candidates)if(candidate.detailsReady){const p=lights.products.find(p=>p.sku===candidate.sku),input=p.sourceUrl;Object.assign(p,candidate,{sourceResolutionEvidence:{inputUrl:input,resolvedUrl:candidate.sourceUrl,method:'official-display-character-exact-SKU-and-family',observedAt:new Date().toISOString()}});}}
 themes.detailAudit=await updateThemeDetails(themes,reader,{shared:[decorations,lights,trees]});
 // Images for existing SKUs are not downloaded or analysed again.
 const all=[...trees.products,...decorations.products,...lights.products,...themes.products],prior={entries:{...trees.browserImageAudit?.entries,...decorations.browserImageAudit?.entries,...lights.browserImageAudit?.entries}};
 const missing=all.filter(p=>!p.cachedImageUrl&&!p.imageIssue?.confirmedUnavailable);if(missing.length){const audit=await reader.auditImages(missing,prior,{bodyBatchSize:100});themes.browserImageAudit={...audit,entries:{...prior.entries,...audit.entries}};}
 const assets=[...new Set(THEME_DEFINITIONS.flatMap(t=>[...t.bannerSources.map(s=>s.url),t.bannerFallback,t.roomset]).filter(Boolean))].map((variantImageUrl,n)=>({sku:'theme-asset-'+n,variantImageUrl}));
 const assetAudit=await reader.auditImages(assets,previous.assetAudit||{},{bodyBatchSize:20});themes.assetAudit=assetAudit;themes.assets=Object.fromEntries(assets.filter(p=>p.cachedImageUrl).map(p=>[p.variantImageUrl,{cachedImageUrl:p.cachedImageUrl,...assetAudit.entries[p.variantImageUrl]}]));
 if(assets.some(p=>!p.cachedImageUrl))throw Error('An official theme banner could not be loaded; source image is not substituted');
 const originals=await mapOriginalImages(all,reader,{batchSize:400});themes.originalsAudit=originals;
 await reader.close();const native=reader.metrics();await budget.settle({credits:native.firecrawlCredits,receipt:native.receipt,report:{mode:'themes-and-original-image-repair',native,themeProducts:themes.products.length,originals}});settled=true;
 await publishLights(lights,native);trees.revision=digest({at:trees.observedAt,products:trees.products});await atomicJson('web/catalogue.json',trees);const status=JSON.parse(await fs.readFile('web/status.json','utf8'));await atomicJson('web/status.json',{...status,revision:trees.revision});await publishDecorations(decorations);await publishDecorationStatus(decorations,{});
 await publishThemes(themes,native);if(!previous.baselineReady&&apiBase&&themes.operationalReady){await control('/internal/extend-baseline',{scope:'christmas-themes-v1',records:themes.products.map(p=>({sku:p.sku,everNew:p.arrivalEvidence==='initial-baseline'&&!!(p.everNew||p.newStatus)})),observedAt:themes.observedAt});themes.baselineReady=true;await publishThemes(themes,native);}
 const proof={success:themes.baselineReady,themeProducts:themes.products.length,sources:themes.sources,coverage:themes.coverage,assets:assets.length,originals,lightingCoverage:lights.coverage,malformedRepaired:candidates.filter(p=>p.detailsReady).map(p=>p.sku),native,newEmailsSent:0,existingNotificationsDeduplicatedBySku:true};await atomicJson('web/themes-initialization-proof.json',proof);console.log(JSON.stringify(proof));
}catch(e){error=e;await reader.close().catch(()=>{});const native=reader.metrics();if(!settled)await budget.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'themes-initialization',error:e.message,native}});if(themes)await publishThemes(themes,native);await publishLights(lights,native);console.error(e.message);process.exitCode=1;}
finally{await reader.close().catch(()=>{})}
