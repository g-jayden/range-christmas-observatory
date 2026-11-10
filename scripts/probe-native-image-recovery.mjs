import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadPolicy} from '../server/collection-policy.mjs';
import {reserveCredits,openCreditBudget} from '../server/credit-budget.mjs';
import {createFirecrawlBrowserReader} from '../server/firecrawl-browser.mjs';
import {publishCollectionCheckpoint} from '../server/collection-checkpoints.mjs';
import {atomicJson} from '../server/sync.mjs';
// One real product, no catalogue refresh and no email. Persist the four-credit
// reservation before opening any browser; always settle its actual receipt.
const env={...process.env,COLLECTION_CHECKPOINTS:'1'},publish=stage=>publishCollectionCheckpoint({stage},{env});
const policy={...await loadPolicy(),maxCreditsPerRun:4,browserCreditsPerRun:4,maxSessionSeconds:120,maxRunSeconds:170,maxFallbackScrapesPerRun:0,browserConcurrency:1};
const balance=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+process.env.FIRECRAWL_API_KEY},signal:AbortSignal.timeout(30000)}).then(async r=>({ok:r.ok,body:await r.json()}));
if(!balance.ok||!Number.isFinite(balance.body.data?.remainingCredits))throw Error('Could not verify the account reserve');
await reserveCredits(policy,{accountRemaining:balance.body.data.remainingCredits});await publish('native-image-probe-reservation');
const budget=await openCreditBudget(policy),saved=JSON.parse(await fs.readFile('web/new-original-recovery.json','utf8')),entry=Object.values(saved.entries).find(e=>e.selectedSku==='519319');
if(!entry)throw Error('The exact SKU and its previously verified original are required');
let reader,report={sku:entry.selectedSku,sourceUrl:entry.sourceUrl,startedAt:new Date().toISOString(),maxCredits:4,emailsSent:0,catalogueRequests:0,success:false};
try{
 reader=await createFirecrawlBrowserReader({policy,budget});
 const product={sku:entry.selectedSku,sourceUrl:entry.sourceUrl,variantImageUrl:entry.url,originalImageUrl:entry.url,detailEvidence:{selectedSku:entry.selectedSku,verifiedProductSection:true}};
 const result=await reader.recoverOriginalImages([product]),image=result.entries[entry.url];
 if(!image?.ok)throw Error('Native image recovery failed: '+JSON.stringify(result.failures));
 const bytes=await fs.readFile('web/'+image.cachedImageUrl),hash=createHash('sha256').update(bytes).digest('hex');
 if(hash!==entry.hash||image.width!==1500||image.height!==1500)throw Error('Native image dimensions or original-byte digest differ from the independently verified source');
 report={...report,success:true,width:image.width,height:image.height,bytes:bytes.length,sha256:hash,sourceBytesUnchanged:true};
}catch(e){report.error=String(e.message).slice(0,500);process.exitCode=1;}
finally{
 await reader?.close();const metrics=reader?.metrics()||{firecrawlCredits:0};
 report={...report,completedAt:new Date().toISOString(),firecrawlCredits:metrics.firecrawlCredits,receipt:metrics.receipt};
 await budget.settle({credits:metrics.firecrawlCredits||0,receipt:metrics.receipt,report});await atomicJson('web/native-image-probe.json',report);await publish('native-image-probe-receipt');console.log(JSON.stringify(report));
}
