import {sourceRetryDue} from '../cloud/source-recovery.mjs';
import {evidenceRetryDue} from '../cloud/evidence-recovery.mjs';
import {hasReadyDeliveries} from '../cloud/delivery-policy.mjs';
import fs from 'node:fs/promises';
import {firstRun,scheduleLabel} from '../server/schedule.mjs';
import {control,apiBase} from '../server/cloud-client.mjs';
import {readDailyMonitor,saveDailyMonitor,dailyDue,claimDailyMonitor} from '../server/daily-monitor-state.mjs';
import {sourceCircuitOpen} from '../server/source-health.mjs';
const event=process.env.GITHUB_EVENT_NAME||'workflow_dispatch',mode=process.env.COLLECTION_MODE||'verify-all';
const repairRequest=await fs.readFile('web/evidence-repair-request.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return null});
const evidenceRepair=event==='push'&&repairRequest?.state==='pending'&&repairRequest?.scope==='current-product-evidence';
let config=JSON.parse(await fs.readFile('web/settings.json','utf8')),full=false,monitor=false,lease=null,fullLease=null,evidenceRecovery=false;
const previousStatus=await fs.readFile('web/status.json','utf8').then(JSON.parse).catch(()=>({}));
let blocked=event==='schedule'&&sourceCircuitOpen(previousStatus.sourceHealth,process.env.COLLECTION_PROVIDER||'firecrawl-browser');
if(!config.nextRunAt)config=firstRun(config);
let daily=await readDailyMonitor();await saveDailyMonitor(daily);
const cloudState=apiBase&&(!blocked||process.env.CONTROL_TOKEN)?await control('/public/status'):null,pendingDelivery=hasReadyDeliveries(cloudState?.monitor);
if(sourceRetryDue(cloudState?.monitor)||evidenceRetryDue(cloudState?.monitor)||dailyDue(daily))blocked=false;
if(event!=='push'&&!['probe','catalogue-probe','repair','monitor-probe','lights-init','themes-init','previews','asda','publish'].includes(mode)&&!blocked){
 if(apiBase){
  const savedConfig=config;const state=cloudState;config=state.config;
  if(!state.baselineReady){const d=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));await control('/internal/seed',{config:savedConfig,records:d.products.map(p=>({sku:p.sku,everNew:Boolean(p.everNew||p.newStatus)}))});config=(await control('/public/status')).config;}
  const wantsDaily=dailyDue(daily)||sourceRetryDue(cloudState?.monitor)||evidenceRetryDue(cloudState?.monitor)||process.env.FORCE_MONITOR==='true';
  if(wantsDaily||Date.now()>=Date.parse(config.nextRunAt)){
   const claim=await control('/internal/claim',{forceMonitor:wantsDaily,ownerRunId:process.env.GITHUB_RUN_ID||null});({config,full,monitor,lease,evidenceRecovery=false}=claim);fullLease=full?lease:null;
   if(monitor&&!wantsDaily){await control('/internal/monitor-complete',{lease,success:false,error:'新品任务由每日07:00入口统一调度；本次没有执行新品检查',scanned:0,newCount:0});monitor=false;}
   if(monitor)daily=await claimDailyMonitor(daily);
  }
 }else full=Date.now()>=Date.parse(config.nextRunAt);
 if(event==='workflow_dispatch'&&process.env.MANUAL_REFRESH!=='false'&&!monitor)full=true;
}
const asdaRequest=await fs.readFile('web/asda/request.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {};throw e;});
const asda=mode==='asda'||event==='push'&&['pending','needs-evidence'].includes(asdaRequest.state)||full||monitor;
const work=full||monitor,publish=!['probe','catalogue-probe'].includes(mode)&&(work||asda||pendingDelivery||event==='push'||event==='workflow_dispatch');
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/tick.json',JSON.stringify({config,full,monitor,asda,lease,fullLease,monitorLease:monitor?lease:null,evidenceRecovery,evidenceRepair,daily}));
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`asda=${asda}\nfull=${full}\nmonitor=${monitor}\ndelivery=${pendingDelivery||monitor}\nwork=${work}\npublish=${publish}\nevidence_repair=${evidenceRepair}\nfull_lease=${fullLease||''}\n`);
console.log(JSON.stringify({schedule:scheduleLabel(config),full,monitor,asda,work,publish,pendingDelivery,sourceCircuitOpen:blocked,provider:'firecrawl-browser',sourceRequestsMade:false}));
