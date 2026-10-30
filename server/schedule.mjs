export const DEFAULT_DAYS=7;
export const DAY=86400000;
export function validateSchedule(value={}){
 const fallback=value.intervalDays===''||value.intervalDays==null;
 const intervalDays=fallback?7:Number(value.intervalDays);
 const time=fallback||value.time===''||value.time==null?'00:00':value.time;
 if(![3,5,7].includes(intervalDays)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('周期只能为3、5、7天；时间必须为北京时间00:00至23:59。');
 return {intervalDays,time,timezone:'Asia/Shanghai'};
}
export function firstRun(value={},now=new Date()){
 const config=validateSchedule(value),local=new Date(+now+8*3600000),[h,m]=config.time.split(':').map(Number);
 return {...config,nextRunAt:new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+config.intervalDays,h,m)-8*3600000).toISOString()};
}
export function advanceRun(config,now=new Date()){
 let due=Date.parse(config.nextRunAt);if(!Number.isFinite(due))throw Error('Invalid next run timestamp');
 while(due<=+now)due+=config.intervalDays*DAY;
 return {...config,nextRunAt:new Date(due).toISOString()};
}
export const scheduleLabel=c=>`每隔${c.intervalDays}天，北京时间${c.time}启动`;
export function nextNewCheck(now=new Date()){
 const local=new Date(+now+8*3600000),daysToWednesday=(3-local.getUTCDay()+7)%7;let due=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+daysToWednesday,7,0)-8*3600000;
 if(due<=+now)due+=7*DAY;return new Date(due).toISOString();
}
export function advanceNewCheck(due,now=new Date()){
 let value=Date.parse(due);if(!Number.isFinite(value))return nextNewCheck(now);while(value<=+now)value+=7*DAY;return new Date(value).toISOString();
}
