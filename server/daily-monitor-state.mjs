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
export async function claimDailyMonitor(m,now=new Date()){
 const claimed={...m,lastAttemptAt:now.toISOString(),nextRunAt:nextNewCheck(now),state:'checking',lastError:null};return saveDailyMonitor(claimed);
}
