import fs from 'node:fs/promises';import {atomicJson} from './sync.mjs';import {nextNewCheck} from './schedule.mjs';
export const DAILY_MONITOR_VERSION='daily-0700-v1';
const file='web/monitor-state.json';
export async function readDailyMonitor(now=new Date()){
 let m;try{m=JSON.parse(await fs.readFile(file,'utf8'))}catch{}
 if(m?.scheduleVersion!==DAILY_MONITOR_VERSION)m={scheduleVersion:DAILY_MONITOR_VERSION,schedule:'每天北京时间07:00检查，有新款才发送邮件',time:'07:00',timezone:'Asia/Shanghai',nextRunAt:nextNewCheck(now),state:'active',lastAttemptAt:null,lastSuccess:null,lastError:null};
 return m;
}
export async function saveDailyMonitor(m){await atomicJson(file,m);return m}
export function dailyDue(m,now=new Date()){const day=d=>new Date(+d+28800000).toISOString().slice(0,10);return +now>=Date.parse(m.nextRunAt)&&(!m.lastAttemptAt||day(now)!==day(new Date(m.lastAttemptAt)))}
export async function claimDailyMonitor(m,now=new Date()){
 const claimed={...m,lastAttemptAt:now.toISOString(),nextRunAt:nextNewCheck(now),state:'checking',lastError:null};return saveDailyMonitor(claimed);
}
