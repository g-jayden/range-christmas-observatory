import fs from 'node:fs/promises';
import {createFirecrawlBrowserReader} from './firecrawl-browser.mjs';
import {openCreditBudget} from './credit-budget.mjs';
import {loadPolicy,verified,productKey,digest,imageMapFingerprint} from './collection-policy.mjs';
import {readState,refreshDetails,saveState} from './incremental.mjs';
import {atomicJson} from './sync.mjs';
import {sourceUrl} from './free-source.mjs';
const snapshot=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),status=JSON.parse(await fs.readFile('web/status.json','utf8'));
const policy={...await loadPolicy(),maxSessionSeconds:120,browserCreditsPerRun:4,maxFallbackScrapesPerRun:26,blockAds:false,repairImagesOnly:true},budget=await openCreditBudget(policy);
const collection=await readState();collection.completed=[];collection.attempted={};
const selected=snapshot.products.filter(p=>!verified(p));
for(const p of selected){delete collection.failures[productKey(p,policy)];p.sourceUrl=sourceUrl('https://www.therange.co.uk/'+p.variantPath.replace('#','/#'));}
let reader,report={phase:'targeted-repair-and-images',success:false},error;
try{
 reader=await createFirecrawlBrowserReader({policy,budget:{...budget,limit:30}});
 const images=await reader.auditImages(snapshot.products,snapshot.browserImageAudit);
 await reader.prepareFamilies(selected);
 let audit;try{audit=await refreshDetails({previous:{...snapshot,products:selected},snapshot:{products:selected},reader,policy,budget,state:collection});}catch(e){audit={checked:0,succeeded:0,error:e.message};console.error(JSON.stringify({phase:'repair-specifications',error:e.message}));}

 await reader.close();const metrics=reader.metrics();
 const unresolved=snapshot.products.filter(p=>!verified(p));
 snapshot.detailsAudit={...snapshot.detailsAudit,verified:snapshot.products.length-unresolved.length,succeeded:snapshot.products.length-unresolved.length,issues:unresolved.map(p=>({sku:p.sku,url:p.sourceUrl,reason:collection.failures[productKey(p,policy)]?.error||'官网尚无可核实的具体SKU规格'})),repair:{checked:audit.checked,succeeded:audit.succeeded,completedAt:new Date().toISOString()}};
 snapshot.revision=digest({observedAt:snapshot.observedAt,products:snapshot.products,sources:snapshot.sources,excluded:snapshot.excluded});
 images.catalogueRevision=snapshot.revision;images.imageMapFingerprint=imageMapFingerprint(snapshot.products);snapshot.browserImageAudit=images;
 snapshot.updatedAt=new Date().toISOString();
 const supplementary={...metrics,phase:'targeted-repair-and-images',completedAt:snapshot.updatedAt};
 snapshot.collectionAudit.supplementalRuns=[...(snapshot.collectionAudit.supplementalRuns||[]),supplementary];
 snapshot.collectionAudit.firecrawlCredits=snapshot.collectionAudit.native.firecrawlCredits+snapshot.collectionAudit.supplementalRuns.reduce((n,r)=>n+r.firecrawlCredits,0);
 Object.assign(status,{revision:snapshot.revision,detailsAudit:snapshot.detailsAudit,browserImageAudit:images,collectionAudit:snapshot.collectionAudit,firecrawlCredits:snapshot.collectionAudit.firecrawlCredits});
 report={phase:'targeted-repair-and-images',success:unresolved.length===0&&images.failed===0,checked:audit.checked,repaired:audit.succeeded,remaining:unresolved.length,images:{checked:images.checked,loaded:images.loaded,failed:images.failed},native:metrics,completedAt:snapshot.updatedAt};
 await budget.settle({credits:metrics.firecrawlCredits,receipt:metrics.receipt,report});
 await atomicJson('web/catalogue.json',snapshot);await atomicJson('web/status.json',status);await saveState(collection);
 console.log(JSON.stringify(report));if(!report.success)process.exitCode=1;
}catch(e){error=e;report.error=e.message;console.error(e.message)}
finally{
 await reader?.close();const metrics=reader?.metrics()||{};
 await budget.settle({credits:metrics.firecrawlCredits||0,receipt:metrics.receipt,report});
 await fs.mkdir('runtime',{recursive:true});await atomicJson('runtime/repair-proof.json',report);
}
if(error)process.exitCode=1;
