import fs from 'node:fs/promises';import {atomicJson} from './sync.mjs';import {nextNewCheck} from './schedule.mjs';
export const DAILY_MONITOR_VERSION='daily-source-0600-digest-0700-v3';
const file='web/monitor-state.json';
export async function readDailyMonitor(now=new Date()){
 let m;try{m=JSON.parse(await fs.readFile(file,'utf8'))}catch{}
 if(m?.scheduleVersion!==DAILY_MONITOR_VERSION)m={...m,scheduleVersion:DAILY_MONITOR_VERSION,schedule:'每天北京时间06:00采集，07:00统一汇总一份新品PDF',time:'06:00',deliveryTime:'07:00',timezone:'Asia/Shanghai',nextRunAt:nextNewCheck(now),state:m?.state||'active',lastAttemptAt:m?.lastAttemptAt||null,lastSuccess:m?.lastSuccess||null,lastError:m?.lastError||null};
 return m;
}
export async function saveDailyMonitor(m){await atomicJson(file,m);return m}
export function dailyDue(m,now=new Date()){const due=Date.parse(m.nextRunAt),attempt=Date.parse(m.lastAttemptAt);return Number.isFinite(due)&&+now>=due&&(!Number.isFinite(attempt)||attempt<due)}
// A local claim advances nextRunAt before collection starts. If that process
// fails or never collects, the cloud's unfinished due source remains decisive.
// A current directory already acquired while photos are pending is reused.
export function dailySourceDue(local,remote,now=new Date()){
 if(dailyDue(local,now))return true;
 const due=Date.parse(remote?.nextRunAt),sources=[remote?.lastDiscoverySuccess,remote?.evidenceSourceAt].map(v=>Date.parse(v)).filter(Number.isFinite),success=sources.length?Math.max(...sources):Date.parse(remote?.lastSuccess)||-Infinity;
 return Number.isFinite(due)&&+now>=due&&success<due;
}
export async function claimDailyMonitor(m,now=new Date()){
 const claimed={...m,lastAttemptAt:now.toISOString(),nextRunAt:nextNewCheck(now),state:'checking',lastError:null};return saveDailyMonitor(claimed);
}
