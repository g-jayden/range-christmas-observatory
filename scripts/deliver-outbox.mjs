import fs from 'node:fs/promises';
import {finishNewEvents,deliverVerifiedEvents} from '../server/new-events.mjs';
import {control} from '../server/cloud-client.mjs';
const file='runtime/notification-outbox.private.json';let out;
try{out=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
process.env.NOTIFICATION_PHASE='deliver';let delivery;
for(let attempt=0;attempt<3;attempt++){
 try{if(out){const result=await finishNewEvents(out.result,{snapshot:out.snapshot,lease:out.lease});delivery=result.delivery;}else delivery=await deliverVerifiedEvents(control);break;}
 catch(e){if(e.providerStatus)console.error(JSON.stringify({phase:'mail-provider-rejection',status:e.providerStatus,code:e.providerCode,reason:String(e.providerMessage||'').replace(/[\w.+-]+@[\w.-]+/g,'[recipient]').slice(0,300),firecrawlCredits:0}));if(e.status!==503||attempt===2)throw e;console.log(JSON.stringify({phase:'attachment-publication-wait',attempt:attempt+1,maxAttempts:3,firecrawlCredits:0}));await new Promise(resolve=>setTimeout(resolve,15000));}
}
if(out)await fs.unlink(file);
if(delivery.morePending||delivery.pendingDeliveries)throw Error('仍有待发新品邮件；云端队列保留，后续仅恢复投递，不重抓商品。');
const receipt={...delivery,verifiedAt:new Date().toISOString(),firecrawlCredits:0};
for(const name of ['monitor-state.json','status.json','collection-ledger.json']){
 const target='web/'+name;let data;try{data=JSON.parse(await fs.readFile(target,'utf8'))}catch(e){if(e.code==='ENOENT')continue;throw e;}
 if(name==='monitor-state.json'){if(data.state==='delivery-pending')data.state='active';data.lastResult={...data.lastResult,deliveryPending:false,delivery:receipt};}
 const report=name==='status.json'?data.collectionAudit:data.lastRun;
 if(report?.notifications)report.notifications={...report.notifications,deliveryPending:false,delivery:receipt};
 await fs.writeFile(target,JSON.stringify(data));
}
console.log(JSON.stringify({success:true,delivery:receipt}));
