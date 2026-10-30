import fs from 'node:fs/promises';import {control,apiBase} from '../server/cloud-client.mjs';import {advanceRun,scheduleLabel} from '../server/schedule.mjs';
const success=process.env.REFRESH_SUCCESS==='true',lease=process.env.SCHEDULE_LEASE;
let config=JSON.parse(await fs.readFile('web/settings.json','utf8'));
if(lease&&apiBase)config=(await control('/internal/full-complete',{lease,success})).config;
else if(lease==='repository-fallback'&&success)config=advanceRun(config);
await fs.writeFile('web/settings.json',JSON.stringify(config));
const status=JSON.parse(await fs.readFile('web/status.json','utf8'));status.schedule=scheduleLabel(config);status.nextCheckAt=config.nextRunAt;await fs.writeFile('web/status.json',JSON.stringify(status));
