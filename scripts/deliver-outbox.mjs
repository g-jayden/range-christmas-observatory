import fs from 'node:fs/promises';
import {finishNewEvents} from '../server/new-events.mjs';
import {control} from '../server/cloud-client.mjs';
const file='runtime/notification-outbox.private.json';let out;
try{out=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
process.env.NOTIFICATION_PHASE='deliver';let delivery;
if(out){const result=await finishNewEvents(out.result,{snapshot:out.snapshot,lease:out.lease});delivery=result.delivery;await fs.unlink(file);}
else for(let batch=0;batch<100;batch++){delivery=await control('/internal/deliver',{});if(!delivery.morePending)break;}
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
