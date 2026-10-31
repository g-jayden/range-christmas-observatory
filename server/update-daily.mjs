import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createFreeReader} from './free-source.mjs';
import {loadPolicy,digest,imageMapFingerprint} from './collection-policy.mjs';
import {catalogueSnapshot,readState,refreshDetails,preserveImages,saveState} from './incremental.mjs';
import {checkNew} from './new-events.mjs';
import {atomicJson} from './sync.mjs';
import {scheduleLabel} from './schedule.mjs';
import {control,apiBase} from './cloud-client.mjs';
export async function runUpdate({readerFactory=createFreeReader,now=()=>Date.now()}={}){
 const previous=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),policy=await loadPolicy();
 let tick;try{tick=JSON.parse(await fs.readFile('runtime/tick.json','utf8'))}catch{tick={full:true,monitor:false,lease:null}}
 let config;try{config=JSON.parse(await fs.readFile('web/settings.json','utf8'))}catch{config={intervalDays:7,time:'00:00'}}
 if(tick.config)config=tick.config;
 const state={schedule:scheduleLabel(config),timezone:'Asia/Shanghai',nextCheckAt:config.nextRunAt||null,startedAt:new Date(now()).toISOString(),lastSuccess:previous.observedAt||null,revision:previous.revision,running:true,mode:'native-free',lastError:null,provider:'native-browser',firecrawlRequests:0,firecrawlCredits:0};
 const collection=await readState();collection.completed=[];
 const budget={remaining:()=>Infinity,summary:()=>({provider:'native-browser',credits:0,firecrawlRequests:0,runLimit:0,monthLimit:0})};
 let reader,catalogueReady=false;
 try{
  reader=await readerFactory({concurrency:policy.browserConcurrency||4,maxPages:policy.maxNativePagesPerRun||20000});
  const gathered=await catalogueSnapshot({previous,reader,policy,now,forceFresh:true,onProgress:c=>console.log('官网免费目录 '+c)});
  let next=gathered.snapshot;catalogueReady=true;
  let notification={success:true,attempted:0,captured:0,deferred:0};
  if(tick.monitor)notification=await checkNew({snapshot:next,reader,policy,budget,state:collection,lease:tick.monitorLease||tick.lease,now});
  const detailEnabled=tick.full!==false&&process.env.COLLECTION_MODE!=='catalogue';
  const audit=await refreshDetails({previous,snapshot:next,reader,policy,budget,state:collection,now,enabled:detailEnabled});
  const imageAudit=preserveImages(previous,next),metrics=reader.metrics?.()||{firecrawlRequests:0,firecrawlCredits:0};
  const report={strategy:'官网接口＋自有浏览器',provider:'native-browser',firecrawlEnabled:false,firecrawlRequests:0,firecrawlCredits:0,sourceObservedAt:next.observedAt,catalogueReused:false,native:metrics,details:audit,notifications:notification,paidFallback:false,completedAt:new Date(now()).toISOString()};
  next.detailsAudit=audit;next.collectionAudit=report;next.imageAudit=imageAudit;
  next.automation={enabled:true,mode:'native-free',provider:'native-browser',intervalDays:config.intervalDays,time:config.time,timezone:'Asia/Shanghai',schedule:scheduleLabel(config)};
  next.updatedAt=new Date(now()).toISOString();next.revision=digest({observedAt:next.observedAt,products:next.products,sources:next.sources,excluded:next.excluded});
  const oldStatus=await fs.readFile('web/status.json','utf8').then(JSON.parse).catch(()=>({}));
  if(oldStatus.browserImageAudit&&imageMapFingerprint(previous.products)===imageMapFingerprint(next.products))state.browserImageAudit={...oldStatus.browserImageAudit,catalogueRevision:next.revision,imageMapReconciled:true};
  await atomicJson('web/catalogue.json',next);
  Object.assign(state,{running:false,lastSuccess:next.observedAt,completedAt:next.updatedAt,revision:next.revision,stats:next.stats,detailsAudit:audit,imageAudit,collectionAudit:report});
  await atomicJson('web/status.json',state);
  await atomicJson('web/collection-ledger.json',{provider:'native-browser',firecrawlRequests:0,firecrawlCredits:0,lastRun:report});
  await saveState(collection);
  if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'catalogue_success=true\n');
  console.log(JSON.stringify({success:true,stats:next.stats,detailsChecked:audit.checked,detailIssues:audit.issues.length,native:metrics,firecrawlCredits:0}));
  return {success:true,catalogueReady:true,state,snapshot:next};
 }catch(e){
  const message=String(e.message).replace(/fc-[\w-]+/g,'[redacted]');
  state.running=false;state.lastError={message,at:new Date(now()).toISOString(),phase:catalogueReady?'details':'catalogue'};state.collectionAudit={provider:'native-browser',firecrawlEnabled:false,firecrawlRequests:0,firecrawlCredits:0,native:reader?.metrics?.()||{},paidFallback:false,verifiedNewSnapshot:false};
  await atomicJson('web/status.json',state);await saveState(collection);
  if(tick.monitor&&apiBase)await control('/internal/monitor-complete',{lease:tick.monitorLease||tick.lease,success:false,error:'免费采集通道本轮未完成，正在重试核验',scanned:0,newCount:0}).catch(()=>{});
  console.error(message);return {success:false,catalogueReady:false,state};
 }finally{await reader?.close?.()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1]))){const result=await runUpdate();if(!result.success)process.exitCode=1}
