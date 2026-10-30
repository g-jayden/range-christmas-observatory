import fs from 'node:fs/promises';import {firstRun,scheduleLabel} from '../server/schedule.mjs';import {control,apiBase} from '../server/cloud-client.mjs';
let config=JSON.parse(await fs.readFile('web/settings.json','utf8')),full=false,monitor=false,lease=null;
if(!config.nextRunAt)config=firstRun(config);
if(apiBase){const claim=await control('/internal/claim',{});({config,full,monitor,lease}=claim);}
else full=Date.now()>=Date.parse(config.nextRunAt);
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/tick.json',JSON.stringify({config,full,monitor,lease}));
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`full=${full}\nmonitor=${monitor}\n`);
console.log(JSON.stringify({schedule:scheduleLabel(config),nextRunAt:config.nextRunAt,full,monitor,backendConfigured:Boolean(apiBase)}));
