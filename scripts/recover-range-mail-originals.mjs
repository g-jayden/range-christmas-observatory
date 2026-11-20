import{productRetailer}from'../web/product-facts.mjs';
import fs from 'node:fs/promises';
import {control} from '../server/cloud-client.mjs';
import {rebuildStoredRangeViews} from '../server/rebuild-range-views.mjs';
import {reportProductEvidence} from '../server/report-product-evidence.mjs';
import {recoverRangeMailImages} from '../server/range-mail-original-recovery.mjs';
import {digestNativeOriginal} from '../server/digest-native-original.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {reserveNativeImageCredits} from '../server/native-credit-budget.mjs';
import {openCreditBudget,runKey} from '../server/credit-budget.mjs';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {publishCollectionCheckpoint} from '../server/collection-checkpoints.mjs';
import {atomicJson} from '../server/sync.mjs';
const plan=await control('/internal/digest-plan',{}),candidates=[...new Map(plan.plans.flatMap(g=>g.products).filter(p=>productRetailer(p)==='the-range').map(p=>[String(p.sku),p])).values()];
if(candidates.length){const range=await rebuildStoredRangeViews({persist:false,includeProducts:true,verifyImageFiles:false}),products=[];for(const candidate of candidates){const p=range.products.find(p=>String(p.sku)===String(candidate.sku));if(p&&reportProductEvidence(p,candidate,range,{retailerId:'the-range'}).accepted)products.push(p);}
 const index=await fs.readFile('web/paid-native-index.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return{version:1,entries:{}};throw e;});let credits=0;
 const result=await recoverRangeMailImages(products,{index,runId:process.env.GITHUB_RUN_ID,freeRead:digestNativeOriginal,readBytes:p=>fs.readFile('web/'+p),writeImage:async(p,b)=>{await fs.mkdir('web/images/source',{recursive:true});await fs.writeFile('web/'+p,b);},captureMany:async rows=>{
  const policy={...await loadPolicy(),catalogueTransport:'enhanced-batch',nativeCaptureEnabled:false,repairImagesOnly:true,imageBatchProbe:false,maxFallbackScrapesPerRun:4,browserCreditsPerRun:2,maxRunSeconds:600,imageCheckpoint:'runtime/range-mail-native-checkpoint.json'};
  const key=process.env.FIRECRAWL_API_KEY;if(!key)throw Error('Approved native-image fallback credential missing');const balance=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)}),account=await balance.json();if(!balance.ok||!Number.isFinite(account.data?.remainingCredits))throw Error('Native account reserve unavailable');
  const reservation=await reserveNativeImageCredits({...policy,maxCreditsPerRun:4},{accountRemaining:account.data.remainingCredits});await publishCollectionCheckpoint({stage:'mail-native-budget-reserved'});const budget=await openCreditBudget(policy),reader=await createFirecrawlBrowserReader({policy,budget});try{return await reader.auditImages(rows,{entries:index.entries},{bodyBatchSize:100});}finally{await reader.close();const m=reader.metrics();credits=m.firecrawlCredits||0;await budget.settle({credits,receipt:{...m.receipt,id:'native-session-range-mail-'+runKey(),credits,authorizationId:reservation.grant.id,billingVerified:m.billingVerified,providerScrapes:m.scrapeReceipts||[],operation:'current-pending-mail-exact-native-images-only'},report:{mode:'Pending Range NEW native originals',selected:rows.length,directoryRequests:0,productPageRequests:0,firecrawlCredits:credits}});}
 }});await atomicJson('web/paid-native-index.json',result.index);await publishCollectionCheckpoint({stage:'mail-native-evidence-saved'});console.log(JSON.stringify({phase:'Recover pending exact Range mail originals',selected:result.selected,free:result.free,recovered:result.captured,failures:result.failures,sourceDirectoriesRequested:0,sourceProductPagesRequested:0,firecrawlCredits:credits}));
}else console.log(JSON.stringify({phase:'No unsent current Range originals require recovery',firecrawlCredits:0,sourceRequests:0}));
