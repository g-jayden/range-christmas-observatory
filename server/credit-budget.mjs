import {monthlyCreditLimit} from './collection-policy.mjs';
import fs from 'node:fs/promises';
import {atomicJson,SourceError} from './sync.mjs';
import {loadUncappedCreditGrants,indexUncappedCreditReceipts,ordinaryCreditUsage,indexScopedNativeReservations,ordinaryReservationTotal} from './credit-scope.mjs';
const file='web/collection-ledger.json';
export const periodKey=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date(now));
export const runKey=()=>String(process.env.GITHUB_RUN_ID||'local')+'-'+String(process.env.GITHUB_RUN_ATTEMPT||'1');
export function budgetError(message){const e=new SourceError(message,402);e.budgetLimited=true;return e;}
export async function readLedger(){
 let data;try{data=JSON.parse(await fs.readFile(file,'utf8'))}catch{data={}};data.version=2;data.periods||={};
 const diagnostics=await fs.readFile('web/collection-diagnostics.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(diagnostics){data.externalReceipts||={};for(const r of diagnostics.receipts){
  if(data.externalReceipts[r.id])continue;
  if(!/^mcp-[a-f0-9-]+$/.test(r.id)||!/^\d{4}-\d{2}$/.test(r.period)||!Number.isFinite(r.credits)||!Number.isFinite(r.refunded)||r.credits<0||r.refunded<0||r.refunded>r.credits)throw Error('Invalid diagnostic billing receipt');
  const p=data.periods[r.period]||={used:0,reservations:{}},net=r.credits-r.refunded;p.used+=net;p.externalCredits=(p.externalCredits||0)+net;data.externalReceipts[r.id]=r;
 }data.unreceiptedDiagnostics=diagnostics.unreceipted;}
 const grants=await loadUncappedCreditGrants();indexScopedNativeReservations(data,diagnostics?.reservationScopes,grants);for(const p of Object.values(data.periods))indexUncappedCreditReceipts(p,grants);
 return data;
}
export async function reserveCredits(policy,{now=Date.now(),key=runKey(),accountRemaining=Infinity}={}){
 const ledger=await readLedger(),period=periodKey(now),p=ledger.periods[period]||={used:0,reservations:{}};p.reservations||={};
 if(p.reservations[key])return {ledger,period,key,limit:p.reservations[key].amount};
 const reserved=ordinaryReservationTotal(p,await loadUncappedCreditGrants());
 const limit=Math.floor(Math.min(policy.maxCreditsPerRun,monthlyCreditLimit(policy)-ordinaryCreditUsage(p).ordinary-reserved,accountRemaining-policy.accountReserveCredits));
 if(limit<(policy.minimumReservationCredits===1?1:2))throw budgetError('本项目积分上限或账户保留额度不足，尚未创建付费会话');
 p.reservations[key]={amount:limit,createdAt:new Date(now).toISOString()};
 ledger.provider='firecrawl-browser';await atomicJson(file,ledger);
 return {ledger,period,key,limit};
}
export async function openCreditBudget(policy,{fetcher=fetch}={}){
 const period=periodKey(),key=runKey();let ledger=await readLedger(),reservation=ledger.periods[period]?.reservations?.[key];
 if(!reservation){if(process.env.GITHUB_ACTIONS==='true')throw budgetError('缺少已持久保存的积分预留，拒绝启动付费会话');const created=await reserveCredits(policy);ledger=created.ledger;reservation=ledger.periods[period].reservations[key]}
 let settled=false,limit=reservation.amount,expanding;
 return {get limit(){return limit;},remaining:()=>settled?0:Infinity,summary:()=>({provider:'firecrawl-browser',runLimit:limit,monthLimit:policy.maxCreditsPerCalendarMonth}),async extend({additionalCredits=32}={}){
  if(settled||policy.automaticBudgetExpansion!==true||monthlyCreditLimit(policy)!==Infinity||!Number.isInteger(additionalCredits)||additionalCredits<1||additionalCredits>64)throw budgetError('Additional source budget is not authorised');
  if(expanding)return expanding;
  expanding=(async()=>{const keySecret=process.env.FIRECRAWL_API_KEY;if(!keySecret)throw budgetError('Source budget expansion requires the existing server credential');const response=await fetcher('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+keySecret},signal:AbortSignal.timeout(30000)}),body=await response.json();if(!response.ok||!Number.isFinite(body.data?.remainingCredits))throw budgetError('Account balance could not be verified for source budget expansion');
   const current=await readLedger(),p=current.periods[period],r=p?.reservations?.[key];if(!r)throw Error('Source budget reservation is missing');const other=Object.entries(p.reservations).filter(([k])=>k!==key).reduce((n,[,r])=>n+(r.amount||0),0),available=Math.floor(body.data.remainingCredits-policy.accountReserveCredits-other-r.amount),added=Math.min(additionalCredits,available);if(added<1)throw budgetError('Account reserve prevents additional source requests');
   r.amount+=added;r.extensions||=[];r.extensions.push({creditsReserved:added,expandedAt:new Date().toISOString(),authorization:'owner-approved-unlimited-ordinary-source',accountReserveProtected:true});limit=r.amount;await atomicJson(file,current);
   if(process.env.COLLECTION_CHECKPOINTS==='1'){const{publishCollectionCheckpoint}=await import('./collection-checkpoints.mjs');await publishCollectionCheckpoint({stage:'source-budget-expanded-before-request'});}
   return {limit,additionalReserved:added,creditsBilled:0};
  })();try{return await expanding;}finally{expanding=null;}
 },async settle({credits=0,receipt=null,report=null}={}){
  if(settled)return;ledger=await readLedger();const p=ledger.periods[period],r=p?.reservations?.[key];if(!r)throw Error('Credit reservation is missing');
  if(!Number.isFinite(credits)||credits<0)throw Error('Invalid Firecrawl credit receipt');
  p.used+=credits;delete p.reservations[key];p.runs||=[];p.runs.push({key,credits,receipt,completedAt:new Date().toISOString()});p.runs=p.runs.slice(-80);indexUncappedCreditReceipts(p,await loadUncappedCreditGrants());
  ledger.lastRun=report;ledger.provider='firecrawl-browser';await atomicJson(file,ledger);settled=true;
 }};
}
