import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {sync,createReader,atomicJson,SourceError} from './sync.mjs';import {parseDetails,applyDetails} from './details.mjs';
const key=process.env.FIRECRAWL_API_KEY||'',full=process.env.FULL_DETAILS!=='false';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nextRun=()=>{const local=new Date(Date.now()+8*3600000);return new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+1)-8*3600000).toISOString()};
let previous=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));
const state={schedule:'每天北京时间00:00开始',timezone:'Asia/Shanghai',nextCheckAt:nextRun(),startedAt:new Date().toISOString(),lastSuccess:previous.observedAt||null,revision:previous.revision||'baseline',running:true,mode:full?'full':'basic',lastError:null};
async function balance(){if(!key)throw Error('Firecrawl account credential not configured');const r=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});const b=await r.json();if(!r.ok)throw Error('Unable to verify source account quota');return b.data||b;}
async function parallel(items,limit,task){let i=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const item=items[i++];await task(item)}}));}
try{
 const credits=await balance();const estimated=(full?previous.products.length:0)+60;if(credits.remainingCredits<estimated)throw Error('Source quota insufficient for complete '+(full?'SKU details':'catalogue')+' update: '+credits.remainingCredits+' available, estimated '+estimated+' required');
 const paid=credits.planCredits>=100000,delayMs=paid?250:credits.planCredits>=5000?750:6500,workers=paid?8:credits.planCredits>=5000?3:1;
 const reader=createReader({key,delayMs});
 let next=await sync({previous,reader,onProgress:category=>console.log('Catalogue '+category)});
 const issues=[];let checked=0;const cacheDir='runtime/details';await fs.mkdir(cacheDir,{recursive:true});
 if(full){
  await parallel(next.products,workers,async p=>{
   const file=path.join(cacheDir,p.sku+'.json');let detail;
   try{detail=JSON.parse(await fs.readFile(file,'utf8'));if(detail.observedDay!==today())detail=null}catch{}
   if(!detail){
    for(let attempt=0;attempt<2;attempt++){
     try{const response=await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown'],waitFor:1500});detail=parseDetails(response,p.sku,p.sourceUrl);detail.observedDay=today();await atomicJson(file,detail);break;}
     catch(e){if([401,402,429].includes(e.status))throw e;if(attempt===1)issues.push({sku:p.sku,error:e.message});}
    }
   }
   if(detail)applyDetails(p,detail);else{p.attributeObservedAt=null;p.heightLabel='高度未确认';p.treeColor='颜色未确认';p.material='材质未确认';p.detailStatus='本轮原站规格未能核验';p.style='标准／其他装饰待核验';p.detailCheckedAt=new Date().toISOString();}
   checked++;if(checked%50===0)console.log('PDP checked '+checked+'/'+next.products.length);
  });
  // Reconcile stock/name/price/NEW/image changes that happened during PDP collection.
  const latest=await sync({previous:next,reader,onProgress:category=>console.log('Final reconciliation '+category)});
  const detailsBySku=new Map(next.products.map(p=>[p.sku,p]));
  for(const p of latest.products){const detail=detailsBySku.get(p.sku);if(detail&&detail.productPath===p.productPath){const fields=['heightLabel','heightCm','heightValues','treeColor','colorValues','material','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm','specifications','style','features','detailEvidence','attributeObservedAt','images','descriptionHash','detailStatus','detailCheckedAt'];for(const k of fields)p[k]=detail[k];}else{p.attributeObservedAt=null;issues.push({sku:p.sku,error:'SKU first appeared during final reconciliation; detailed specifications pending'});}}
  next=latest;
 }
 next.detailsAudit={mode:full?'all-SKU-pages-attempted':'basic-catalogue-only',checked,issues,completedAt:new Date().toISOString()};
 next.automation={enabled:true,schedule:'0 16 * * *',timezone:'Asia/Shanghai',type:'GitHub Actions daily cloud update',mode:full?'full':'basic'};
 const images=next.products.filter(p=>/^https:\/\//.test(p.variantImageUrl||p.imageUrl||''));let mirrored=0;const failures=[];
 // Cache genuine source photographs when the source permits a server-side download.
 await fs.mkdir('web/images',{recursive:true});
 await parallel(images,4,async p=>{const url=p.variantImageUrl||p.imageUrl;try{const origin=new URL(url);if(origin.protocol!=='https:'||!(origin.hostname==='therange.co.uk'||origin.hostname.endsWith('.therange.co.uk')))throw Error('Unexpected source image origin');const r=await fetch(url,{headers:{'user-agent':'TheRangeCatalogueResearch/1.0'},signal:AbortSignal.timeout(20000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw Error('Source image HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());if(b.length>5000000)throw Error('Source image exceeds site cache limit');const ext=r.headers.get('content-type').includes('png')?'png':r.headers.get('content-type').includes('webp')?'webp':'jpg',name=createHash('sha256').update(b).digest('hex')+'.'+ext;await fs.writeFile('web/images/'+name,b);p.cachedImageUrl='images/'+name;p.imageStatus='cloud-source-image-downloaded';p.imageCheckedAt=new Date().toISOString();mirrored++;}catch(e){delete p.cachedImageUrl;p.imageStatus='current-source-url; browser-load-required';failures.push({sku:p.sku,reason:e.message});}});
 next.imageAudit={checked:images.length,mirrored,sourceUrlsRetained:failures.length,failures,completedAt:new Date().toISOString()};
 const used=new Set(next.products.map(p=>p.cachedImageUrl?.split('/').pop()).filter(Boolean));for(const name of await fs.readdir('web/images'))if(/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(name)&&!used.has(name))await fs.unlink(path.join('web/images',name));
 next.updatedAt=new Date().toISOString();next.revision=createHash('sha256').update(JSON.stringify(next)).digest('hex');
 await atomicJson('web/catalogue.json',next);
 Object.assign(state,{running:false,lastSuccess:next.observedAt,completedAt:next.updatedAt,revision:next.revision,stats:next.stats,detailsAudit:next.detailsAudit,imageAudit:{checked:images.length,mirrored,sourceUrlsRetained:failures.length},nextCheckAt:nextRun()});
 await atomicJson('web/status.json',state);console.log(JSON.stringify({success:true,stats:next.stats,detailsChecked:checked,detailIssues:issues.length,imagesMirrored:mirrored,sourceImagesRetained:failures.length}));
}catch(e){state.running=false;state.lastError={message:String(e.message).replace(/fc-[\w-]+/g,'[redacted]'),at:new Date().toISOString()};await atomicJson('web/status.json',state);console.error(state.lastError.message);process.exitCode=1;}
