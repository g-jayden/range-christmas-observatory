import fs from 'node:fs/promises';
import {releaseUnusedMonitor} from '../server/monitor-cleanup.mjs';
const tick=await fs.readFile('runtime/tick.json','utf8').then(JSON.parse).catch(()=>null);
if(await releaseUnusedMonitor(tick))console.log('Released unused NEW claim; source credits 0');
