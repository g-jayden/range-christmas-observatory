import fs from 'node:fs/promises';import {firstRun,scheduleLabel} from '../server/schedule.mjs';import {control,apiBase} from '../server/cloud-client.mjs';
let config=JSON.parse(await fs.readFile('web/settings.json','utf8')),full=false,monitor=false,lease=null;
if(!config.nextRunAt)config=firstRun(config);
if(apiBase){
 const state=await control('/public/status');
 if(!state.baselineReady){const d=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),known=new Map(Object.entries(d.firstObservedHistory||{}).map(([sku,h])=>[sku,{sku,everNew:Boolean(h.everNew)}]));for(const p of d.products)known.set(p.sku,{sku:p.sku,everNew:Boolean(p.everNew||p.newStatus||known.get(p.sku)?.everNew)});await control('/internal/seed',{config,records:[...known.values()]});}
 const claim=await control('/internal/claim',{forceMonitor:process.env.FORCE_MONITOR==='true'});({config,full,monitor,lease}=claim);
}
else full=Date.now()>=Date.parse(config.nextRunAt);
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/tick.json',JSON.stringify({config,full,monitor,lease}));
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`full=${full}\nmonitor=${monitor}\n`);
console.log(JSON.stringify({schedule:scheduleLabel(config),nextRunAt:config.nextRunAt,full,monitor,backendConfigured:Boolean(apiBase)}));
