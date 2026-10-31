import fs from 'node:fs/promises';
import {atomicJson,SourceError} from './sync.mjs';
const file='web/collection-ledger.json';
export const periodKey=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date(now));
export const runKey=()=>String(process.env.GITHUB_RUN_ID||'local')+'-'+String(process.env.GITHUB_RUN_ATTEMPT||'1');
export function budgetError(message){const e=new SourceError(message,402);e.budgetLimited=true;return e;}
export async function readLedger(){let data;try{data=JSON.parse(await fs.readFile(file,'utf8'))}catch{data={}};data.version=2;data.periods||={};return data;}
export async function reserveCredits(policy,{now=Date.now(),key=runKey(),accountRemaining=Infinity}={}){
 const ledger=await readLedger(),period=periodKey(now),p=ledger.periods[period]||={used:0,reservations:{}};p.reservations||={};
 if(p.reservations[key])return {ledger,period,key,limit:p.reservations[key].amount};
 const reserved=Object.values(p.reservations).reduce((n,r)=>n+r.amount,0);
 const limit=Math.floor(Math.min(policy.maxCreditsPerRun,policy.maxCreditsPerCalendarMonth-p.used-reserved,accountRemaining-policy.accountReserveCredits));
 if(limit<2)throw budgetError('本项目积分上限或账户保留额度不足，尚未创建付费会话');
 p.reservations[key]={amount:limit,createdAt:new Date(now).toISOString()};
 ledger.provider='firecrawl-browser';await atomicJson(file,ledger);
 return {ledger,period,key,limit};
}
export async function openCreditBudget(policy){
 const period=periodKey(),key=runKey();let ledger=await readLedger(),reservation=ledger.periods[period]?.reservations?.[key];
 if(!reservation){if(process.env.GITHUB_ACTIONS==='true')throw budgetError('缺少已持久保存的积分预留，拒绝启动付费会话');const created=await reserveCredits(policy);ledger=created.ledger;reservation=ledger.periods[period].reservations[key]}
 let settled=false;
 return {limit:reservation.amount,remaining:()=>settled?0:Infinity,summary:()=>({provider:'firecrawl-browser',runLimit:reservation.amount,monthLimit:policy.maxCreditsPerCalendarMonth}),async settle({credits=0,receipt=null,report=null}={}){
  if(settled)return;ledger=await readLedger();const p=ledger.periods[period],r=p?.reservations?.[key];if(!r)throw Error('Credit reservation is missing');
  if(!Number.isFinite(credits)||credits<0)throw Error('Invalid Firecrawl credit receipt');
  p.used+=credits;delete p.reservations[key];p.runs||=[];p.runs.push({key,credits,receipt,completedAt:new Date().toISOString()});p.runs=p.runs.slice(-80);
  ledger.lastRun=report;ledger.provider='firecrawl-browser';await atomicJson(file,ledger);settled=true;
 }};
}
