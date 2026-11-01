import fs from 'node:fs/promises';
import {catalogueSnapshot,readState,saveState} from './incremental.mjs';
import {checkNew,finishNewEvents} from './new-events.mjs';
import {enrichProducts,selectGalleryImages} from './enrich-appearance.mjs';
import {readDailyMonitor,saveDailyMonitor} from './daily-monitor-state.mjs';
import {atomicJson} from './sync.mjs';
import {digest} from './collection-policy.mjs';
import {control} from './cloud-client.mjs';
export async function runMonitorDaily({previous,policy,readerFactory,budgetFactory,now=()=>Date.now(),tick={},collectSnapshot=catalogueSnapshot}){
 const probe=process.env.COLLECTION_MODE==='monitor-probe',state=await readState();let reader,budget;
 let daily=await readDailyMonitor(new Date(now())),outcome;
 try{
  budget=await budgetFactory(policy);reader=await readerFactory({policy,budget});
  const {snapshot}=await collectSnapshot({previous,reader,policy,now,forceFresh:true,onProgress:console.log});
  let result={success:true,captured:0,attempted:0,scanned:snapshot.products.length,events:[],deferred:0,issues:[]};
  if(!probe)result=await checkNew({snapshot,reader,policy,budget,state,lease:tick.monitorLease||tick.lease,now,deferDelivery:true});
  const candidates=snapshot.products.filter(p=>result.events.some(e=>e.product.sku===p.sku));
  await selectGalleryImages(candidates);await reader.closeBrowser?.();
  const imageAudit=candidates.length?await reader.auditImages?.(candidates,previous.browserImageAudit):null;
  await reader.close?.();
  const appearanceAudit=candidates.length?await enrichProducts(candidates):{products:0,analysedImages:0,firecrawlCredits:0};
  // Do not send a screenshot whose exact SKU/body image failed validation.
  if(imageAudit?.failed)throw Error('新品商品图片未全部通过，未发送本轮通知');
  if(!probe)result=await finishNewEvents(result,{snapshot,lease:tick.monitorLease||tick.lease});
  const native=reader.metrics(),report={success:result.success,mode:probe?'daily-discovery-probe':'daily-new-only',observedAt:snapshot.observedAt,scanned:snapshot.products.length,candidates:result.captured,notification:result,fullDetailSweep:false,fullImageSweep:false,appearanceAudit,native,firecrawlCredits:native.firecrawlCredits};
  await budget.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report});
  await atomicJson('web/monitor-proof.json',report);
  if(!probe){
   const old=await fs.readFile('web/new-arrivals.json','utf8').then(JSON.parse).catch(()=>({products:[],history:[]}));
   const additions=snapshot.products.filter(p=>p.newStatus&&p.arrivalEvidence==='observed-after-baseline');
   const rows=new Map((old.products||[]).map(p=>[p.sku,p]));for(const p of additions)rows.set(p.sku,p);
   // Preserve daily first-NEW observations independently of full-refresh timing.
   const history=[...new Map([...(old.history||[]),...snapshot.products.filter(p=>p.firstNewObservedAt&&p.arrivalEvidence==='observed-after-baseline').map(p=>({sku:p.sku,firstNewObservedAt:p.firstNewObservedAt,firstObservedAt:p.firstObservedAt,everNew:true,arrivalEvidence:p.arrivalEvidence}))].map(p=>[p.sku,p])).values()];
   await atomicJson('web/new-arrivals.json',{version:1,observedAt:snapshot.observedAt,products:[...rows.values()],history,browserImageAudit:imageAudit||old.browserImageAudit,revision:digest({at:snapshot.observedAt,history}),sourceCheckSuccess:result.success});
   daily={...daily,state:result.success?'active':'error',lastSuccess:result.success?snapshot.observedAt:daily.lastSuccess,lastError:result.success?null:'部分新品证据未通过核验，待下次每日任务处理',lastResult:report};await saveDailyMonitor(daily);
  }
  await saveState(state);console.log(JSON.stringify(report));outcome={success:result.success,catalogueReady:true,state:daily};
 }catch(e){
  await reader?.close?.().catch(()=>{});const native=reader?.metrics?.()||{};const error=String(e.message).replace(/fc-[\w-]+/g,'[redacted]');
  await budget?.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'daily-new-only',success:false,error,native}});
  if(!probe){await saveDailyMonitor({...daily,state:'error',lastError:error});await control('/internal/monitor-complete',{lease:tick.monitorLease||tick.lease,success:false,error:'新品检查未完成，未将失败记录为没有新品',scanned:0,newCount:0}).catch(()=>{});}
  await atomicJson('web/monitor-proof.json',{success:false,observedAt:new Date(now()).toISOString(),error,native,firecrawlCredits:native.firecrawlCredits||0});outcome={success:false,state:daily};console.error(error);
 }finally{await reader?.close?.()}
 return outcome;
}
