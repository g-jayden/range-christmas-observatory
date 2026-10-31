import fs from 'node:fs/promises';
import {firstRun,scheduleLabel} from '../server/schedule.mjs';
import {control,apiBase} from '../server/cloud-client.mjs';
import {sourceCircuitOpen} from '../server/source-health.mjs';
const event=process.env.GITHUB_EVENT_NAME||'workflow_dispatch',mode=process.env.COLLECTION_MODE||'verify-all';
let config=JSON.parse(await fs.readFile('web/settings.json','utf8')),full=false,monitor=false,lease=null,fullLease=null;
const previousStatus=await fs.readFile('web/status.json','utf8').then(JSON.parse).catch(()=>({}));
const blocked=event==='schedule'&&sourceCircuitOpen(previousStatus.sourceHealth,process.env.COLLECTION_BROWSER_CHANNEL||'firefox');
if(!config.nextRunAt)config=firstRun(config);
if(event!=='push'&&mode!=='probe'&&!blocked){
 if(apiBase){
  const state=await control('/public/status');config=state.config;
  if(!state.baselineReady){const d=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));await control('/internal/seed',{config,records:d.products.map(p=>({sku:p.sku,everNew:Boolean(p.everNew||p.newStatus)}))})}
  const claim=await control('/internal/claim',{forceMonitor:process.env.FORCE_MONITOR==='true'});
  ({config,full,monitor,lease}=claim);fullLease=full?lease:null;
 }else full=Date.now()>=Date.parse(config.nextRunAt);
 if(event==='workflow_dispatch'&&process.env.MANUAL_REFRESH!=='false')full=true;
}
const work=full||monitor,publish=mode!=='probe'&&(work||event==='push'||event==='workflow_dispatch');
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/tick.json',JSON.stringify({config,full,monitor,lease,fullLease,monitorLease:monitor?lease:null}));
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`full=${full}\nmonitor=${monitor}\nwork=${work}\npublish=${publish}\nfull_lease=${fullLease||''}\n`);
console.log(JSON.stringify({schedule:scheduleLabel(config),full,monitor,work,publish,sourceCircuitOpen:blocked,provider:'native-browser',firecrawlCredits:0}));
