import fs from 'node:fs/promises';
import {atomicJson} from '../server/sync.mjs';
import {hasVerifiedDetails,reconcileVerifiedEvidence,restoreVerifiedRegistry,saveVerifiedRegistry} from '../server/verified-evidence.mjs';
import {loadDecorationDetails,publishDecorations,publishDecorationStatus,decorationReadiness} from '../server/decorations.mjs';
import {loadLightingDetails,publishLights} from '../server/lights.mjs';
import {loadThemeDetails,publishThemes} from '../server/themes.mjs';
import {parseDetails,applyDetails} from '../server/details.mjs';
import {detailFingerprint,loadPolicy} from '../server/collection-policy.mjs';
import {repairDirectImages} from '../server/direct-image-repair.mjs';
import {openCreditBudget} from '../server/credit-budget.mjs';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';

const read=async(name,fallback=null)=>fs.readFile('web/'+name+'.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return fallback});
const names=['catalogue','decorations','lights','themes'],snapshots=await Promise.all(names.map(n=>read(n))),request=await read('evidence-repair-request');
const count=s=>({total:s?.products.length||0,unverified:(s?.products||[]).filter(p=>!p.detailsReady&&!hasVerifiedDetails(p)).length,missingImages:(s?.products||[]).filter(p=>!p.cachedImageUrl||!p.imageCacheEvidence?.sha256).length});
const before=Object.fromEntries(names.map((n,i)=>[n,count(snapshots[i])])),sourceDates=snapshots.map(s=>s.observedAt);
await restoreVerifiedRegistry(snapshots[0].products);await loadDecorationDetails(snapshots[1].products);await loadLightingDetails(snapshots[2].products);await loadThemeDetails(snapshots[3].products);
const seeds=await read('evidence-recovery-seeds',{products:[],families:[]});
const cachedRecovery=reconcileVerifiedEvidence([...snapshots,{products:seeds.products||[]}]);
for(const f of seeds.families||[])for(const s of snapshots)for(const p of s.products.filter(p=>String(p.sku)===String(f.sku)&&p.sourceUrl===f.sourceUrl&&!hasVerifiedDetails(p))){const detail=parseDetails({success:true,data:{metadata:{statusCode:200},sourceVariant:f.variant,familyEvidence:f.evidence}},p.sku,p.sourceUrl);applyDetails(p,detail);p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);delete p.detailIssue;}
const sharedRecovery=reconcileVerifiedEvidence(snapshots);await saveVerifiedRegistry(snapshots.flatMap(s=>s.products));
const directImages=await repairDirectImages(snapshots);console.log(JSON.stringify({phase:'direct-official-image-repair',...directImages,failures:directImages.failures.length}));
const unique=new Map();for(const s of snapshots)for(const p of s.products){const q=unique.get(p.sku);if(!q||!hasVerifiedDetails(q)&&hasVerifiedDetails(p))unique.set(p.sku,p);}
const pending=[...unique.values()].filter(p=>!hasVerifiedDetails(p)&&p.taxonomyAudit?.disposition!=='exclude'),issues=[],resolutionChecks=[];let reader,budget,paidRepaired=0,resolved=0;
const accept=(p,d)=>{applyDetails(p,d);p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);delete p.detailIssue;delete p.detailError;paidRepaired++;};
const ownsRequest=request?.state==='claimed'&&request.ownerRunId===process.env.GITHUB_RUN_ID;
if(ownsRequest&&pending.length){
 const base=await loadPolicy(),policy={...base,catalogueTransport:'enhanced-batch',nativeCaptureEnabled:false,maxFallbackScrapesPerRun:20,browserCreditsPerRun:2,maxSessionSeconds:60,maxRunSeconds:1500,repairImagesOnly:true,familyBatchSize:40,familyBatchConcurrency:6,familyFetchTimeoutMs:10000};
 budget=await openCreditBudget(policy);reader=await createFirecrawlBrowserReader({policy,budget:{...budget,limit:Math.min(20,budget.limit)}});
 try{
  for(let i=0;i<pending.length;i+=40){const batch=pending.slice(i,i+40);let prep;try{await reader.prepareFamilies(batch)}catch(e){prep=e;}
   for(const p of batch)try{if(!reader.familyReady(p.sourceUrl)){if(prep)throw prep;await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown']});}const d=parseDetails(await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown']}),p.sku,p.sourceUrl);accept(p,d);}catch(e){p.detailIssue={sku:p.sku,status:e.status||0,reason:String(e.message).slice(0,200),sourceResponse:e.sourceResponse,sourceUnavailable:e.sourceResponse?.htmlStatus===404&&[404,500].includes(e.sourceResponse?.jsonStatus),observedAt:new Date().toISOString()};issues.push({sku:p.sku,...p.detailIssue});}
   await saveVerifiedRegistry(batch);console.log(JSON.stringify({phase:'targeted-product-evidence-repair',processed:Math.min(i+40,pending.length),total:pending.length,repaired:paidRepaired,directoryRequests:0}));if(prep?.budgetLimited)break;
  }
  const dead=pending.filter(p=>!hasVerifiedDetails(p)&&p.detailIssue?.sourceUnavailable);
  for(let i=0;i<dead.length;i+=12){let links;try{links=await reader.resolveProductPages(dead.slice(i,i+12))}catch(e){issues.push({phase:'official-search',error:String(e.message).slice(0,150)});break;}
   resolutionChecks.push(...links);
   const candidates=[];for(const link of links){const p=unique.get(link.sku);if(!p||!link.sourceUrl||link.sourceUrl===p.sourceUrl)continue;candidates.push({...p,sourceUrl:link.sourceUrl,_prior:p,_search:link.searchUrl});}
   if(candidates.length)try{await reader.prepareFamilies(candidates)}catch{}
   for(const q of candidates)try{const d=parseDetails(await reader.raw(q.sourceUrl,{formats:['rawHtml','markdown']}),q.sku,q.sourceUrl),p=q._prior,input=p.sourceUrl;p.sourceUrl=q.sourceUrl;p.rawSourceUrl=input;p.sourceResolutionEvidence={selectedSku:p.sku,inputUrl:input,resolvedUrl:q.sourceUrl,searchUrl:q._search,verifiedAt:d.observedAt,method:'official-search-and-exact-SKU-JSON'};accept(p,d);resolved++;}catch{}
  }
  for(const p of pending.filter(p=>!hasVerifiedDetails(p)&&!p.detailIssue?.sourceUnavailable).slice(0,4))try{const d=parseDetails(await reader.readSelectedDetails(p),p.sku,p.sourceUrl);accept(p,d);}catch(e){issues.push({sku:p.sku,phase:'exact-SKU-rendered-page',error:String(e.message).slice(0,150)});if(e.budgetLimited)break;}
  const missing=[...unique.values()].filter(p=>!p.cachedImageUrl||!p.imageCacheEvidence?.sha256);if(missing.length)try{const audit=await reader.auditImages(missing,{entries:Object.assign({},...snapshots.map(s=>s.browserImageAudit?.entries||{}))},{bodyBatchSize:30});for(const s of snapshots){s.browserImageAudit.entries={...s.browserImageAudit.entries,...audit.entries};for(const p of s.products){const q=unique.get(p.sku);if(q!==p&&q.cachedImageUrl&&(q.variantImageUrl||q.imageUrl)===(p.variantImageUrl||p.imageUrl)){p.cachedImageUrl=q.cachedImageUrl;p.imageCacheEvidence=q.imageCacheEvidence;}}}}catch(e){issues.push({phase:'bounded-image-repair',error:String(e.message).slice(0,150)});}
 }catch(e){issues.push({phase:'targeted-repair',error:String(e.message).slice(0,200)});}
 finally{await reader.close();const metrics=reader.metrics();await budget.settle({credits:metrics.firecrawlCredits||0,receipt:metrics.receipt,report:{mode:'targeted-product-evidence-repair',directoryRequests:0,selected:pending.length,repaired:paidRepaired,metrics}});}
}
const finalRecovery=reconcileVerifiedEvidence(snapshots);await saveVerifiedRegistry(snapshots.flatMap(s=>s.products));
const images=await repairDirectImages(snapshots);
for(let i=0;i<snapshots.length;i++)if(sourceDates[i]!==snapshots[i].observedAt)throw Error('Repair cannot invent a fresh directory timestamp');
await atomicJson('web/catalogue.json',snapshots[0]);decorationReadiness(snapshots[1]);await publishDecorations(snapshots[1]);await publishDecorationStatus(snapshots[1],reader?.metrics()||{});await publishLights(snapshots[2]);await publishThemes(snapshots[3]);
const remaining=[...unique.values()].filter(p=>!hasVerifiedDetails(p)&&p.taxonomyAudit?.disposition!=='exclude').map(p=>({sku:p.sku,title:p.variantName,sourceUrl:p.sourceUrl,issue:p.detailIssue,search:resolutionChecks.find(r=>r.sku===p.sku)||null}));
const report={completedAt:new Date().toISOString(),before,after:Object.fromEntries(names.map((n,i)=>[n,count(snapshots[i])])),cachedRecovery,sharedRecovery,finalRecovery,paidRepaired,resolved,directImages,images,directoryRequests:0,sourceDatesPreserved:true,firecrawlCredits:reader?.metrics().firecrawlCredits||0,issues,resolutionChecks,remaining,scope:'Existing evidence only; no NEW discovery or mail dispatch'};
report.success=snapshots.every(s=>s.products.filter(p=>p.taxonomyAudit?.disposition!=='exclude').every(p=>hasVerifiedDetails(p)))&&images.failed===0;
await atomicJson('web/product-evidence-repair.json',report);if(ownsRequest)await atomicJson('web/evidence-repair-request.json',{...request,state:'complete',completedAt:report.completedAt,report:'product-evidence-repair.json'});console.log(JSON.stringify({...report,cachedRecovery:{restored:cachedRecovery.restored},sharedRecovery:{restored:sharedRecovery.restored},finalRecovery:{restored:finalRecovery.restored},issues:issues.length,images:{...images,failures:images.failures.length}}));
