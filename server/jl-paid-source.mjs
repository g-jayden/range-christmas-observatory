import fs from'node:fs/promises';import{createHash}from'node:crypto';
import{JL_DIRECTORIES}from'../web/jl-model.mjs';import{readJlDirectoryDom}from'./jl-list-dom.mjs';import{sanitiseJlFamily}from'./jl-source.mjs';import{johnLewisDailyPolicy}from'./jl-daily-policy.mjs';import{readLedger,periodKey,runKey}from'./credit-budget.mjs';import{atomicJson}from'./sync.mjs';
// Read many ordinary public resources in one provider page. The price, selected
// variant and gallery still come from the exact official product business data.
export function jlBatchAction(items,{directories=false}={}){
 return '('+ (async function(items,directories,readSource){
  const read=(0,eval)('('+readSource+')'),rows=[],failures=[];let requests=0,cursor=0;
  async function get(url){for(let attempt=0;attempt<2;attempt++){requests++;try{const r=await fetch(url,{signal:AbortSignal.timeout(18000)});if(r.status===200)return await r.text();const e=Object.assign(Error('Official source HTTP '+r.status),{status:r.status});if(![408,500,502,503,504].includes(r.status)||attempt)throw e;}catch(e){if(e.status||attempt)throw e;}}}
  async function pages(url){const pages=[],seen=new Set();for(let next=url;next;){if(seen.has(next))throw Error('Official directory pagination did not close');seen.add(next);const html=await get(next),p=read({html,url:next});if(!p.count||!p.rows.length||!/John Lewis/i.test(p.documentTitle||''))throw Error('Official directory content incomplete');pages.push({...p,status:200,observedAt:new Date().toISOString()});next=p.next;}return pages;}
  await Promise.all(Array.from({length:Math.min(directories?3:8,items.length)},async()=>{while(cursor<items.length){const item=items[cursor++];try{if(directories){const main=await pages(item.url),ranges=[];for(const r of main.flatMap(p=>p.rows).filter(r=>r.type==='range-navigation'&&!r.sponsored)){if(!r.sourceUrl)throw Error('Official range URL missing');ranges.push({url:r.sourceUrl,pages:await pages(r.sourceUrl)});}rows.push({id:item.id,pages:main,ranges});}else{const html=await get(item.url),d=new DOMParser().parseFromString(html,'text/html'),raw=d.querySelector('#__NEXT_DATA__')?.textContent,product=raw?JSON.parse(raw).props?.pageProps?.product:null;if(!product?.title||!product.variants?.length)throw Error('Exact public family JSON missing');const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));rows.push({id:item.id,url:item.url,observedAt:new Date().toISOString(),product:{...pick(product,['title','aliases','availability','defaultVariant','canonicalURL','pdpURL','unitOfMeasure','description','howToUse','productTypeHierarchy','sellingProductType','brand','attributes','messaging','icons']),variants:product.variants.map(v=>pick(v,['id','title','canonicalURL','pdpURL','displayCode','messaging','price','availability','images','aliases','differentiators','colour','attributes']))}});}}catch(e){failures.push({id:item.id,url:item.url,status:e.status||0,error:String(e.message).slice(0,200)});}}}));return{rows,failures,requests};
 }).toString()+')('+JSON.stringify(items)+','+directories+','+JSON.stringify(readJlDirectoryDom.toString())+')';
}
export async function collectJlPaid({key,fetcher=fetch,root='web/jl',runtime='runtime/jl-paid-source',maxCredits=Infinity}={}){
 if(!key)throw Error('Configured Firecrawl credential missing');
 const policy=johnLewisDailyPolicy(JSON.parse(await fs.readFile('web/jl-collection-authorization.json','utf8')));
 await fs.mkdir(root,{recursive:true});await fs.mkdir(runtime,{recursive:true});
 const file=root+'/paid-daily-checkpoint.json',started=Date.now(),day=new Date(started+28800000).toISOString().slice(0,10);
 const prior=await fs.readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const checkpoint=prior?.day===day&&started-Date.parse(prior.startedAt)<30*60000?prior:{day,startedAt:new Date(started).toISOString(),responses:{},receipts:[]};
 let credits=0,requests=0;const receipts=[];
 const save=()=>atomicJson(file,checkpoint);
 async function book(record,replay=false){
  if(!replay){receipts.push(record);checkpoint.receipts.push(record);await save();}
  const ledger=await readLedger(),period=periodKey(),p=ledger.periods[period]||={used:0,reservations:{},runs:[]};p.runs||=[];
  if(!p.runs.some(r=>r.receipt?.id===record.id)){p.used+=record.credits;p.runs.push({key:'jl-'+runKey(),credits:record.credits,receipt:record,completedAt:record.completedAt});}
  ledger.jlPaidFallback={authorizationId:policy.authorizationId,monthlyLimit:null,maxCreditsPerRun:null,scope:'John Lewis seven official Christmas categories only',creditsThisRun:credits};
  if(!replay)ledger.lastRun={retailerId:'jl',firecrawlCredits:credits,billingVerified:receipts.every(r=>r.billingVerified),completedAt:new Date().toISOString()};
  await atomicJson('web/collection-ledger.json',ledger);
 }
 for(const receipt of checkpoint.receipts)await book(receipt,true);
 async function batch(items,directories,proxy){
  const entry='https://www.johnlewis.com'+JL_DIRECTORIES[0][1]+'?page=2';
  const payload={url:entry,formats:['rawHtml'],onlyMainContent:false,maxAge:0,proxy,parsers:[],timeout:240000,actions:[{type:'executeJavascript',script:jlBatchAction(items,{directories})}]};
  const identity=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),cached=checkpoint.responses[identity];
  if(cached?.result)return cached.result;
  if(!directories){const saved=new Map;for(const prior of Object.values(checkpoint.responses))for(const row of prior.result?.rows||[])if(row.product?.title&&items.some(i=>i.id===row.id&&i.url===row.url))saved.set(row.id,row);if(saved.size===items.length)return {rows:items.map(i=>saved.get(i.id)),failures:[],requests:0};}
  if(credits>=maxCredits)throw Error('Requested diagnostic budget reached');
  if(cached?.started)throw Error('Previous identical John Lewis paid request has no confirmed result; automatic duplicate charge stopped');
  const balance=await fetcher('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)}),account=await balance.json(),left=account.data?.remainingCredits??account.remainingCredits;
  if(!balance.ok||!Number.isFinite(left)||left-policy.accountReserveCredits<5)throw Error('John Lewis account reserve cannot cover the next actual request');
  checkpoint.responses[identity]={started:new Date().toISOString(),proxy};await save();
  let record={id:'jl-'+runKey()+'-'+identity,retailerId:'jl',authorizationId:policy.authorizationId,phase:directories?'directories':'exact-families',proxy,billingVerified:false},raw;
  try{
   const r=await fetcher('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(270000)}),b=await r.json();raw=b.data||{};
   const amount=raw.metadata?.creditsUsed;record={...record,id:raw.metadata?.scrapeId||record.id,credits:Number.isFinite(amount)?amount:5,billingVerified:Number.isFinite(amount),httpStatus:r.status,sourceStatus:raw.metadata?.statusCode};
   if(!r.ok||!b.success||raw.metadata?.statusCode!==200)throw Object.assign(Error('John Lewis provider/source HTTP '+r.status+'/'+raw.metadata?.statusCode),{billingVerified:record.billingVerified});
   let result=raw.actions?.javascriptReturns?.[0]?.value;if(typeof result==='string')result=JSON.parse(result);
   if(!Array.isArray(result?.rows)||!Array.isArray(result.failures)||result.rows.some(row=>!items.some(item=>item.id===row.id)))throw Error('John Lewis exact official batch result missing or unexpected');
   requests+=result.requests||0;checkpoint.responses[identity]={...checkpoint.responses[identity],result,complete:true};return result;
  }catch(e){record.error=String(e.message).slice(0,250);e.billingVerified=record.billingVerified;throw e;}
  finally{record.credits??=5;record.completedAt=new Date().toISOString();credits+=record.credits;await book(record);await fs.writeFile(runtime+'/receipts.json',JSON.stringify(receipts));}
 }
 async function completeBatch(items,directories){
  const found=new Map,failures=[];
  for(const proxy of ['basic','enhanced']){
   const missing=items.filter(item=>!found.has(item.id));if(!missing.length)break;
   let result;try{result=await batch(missing,directories,proxy);}catch(e){if(!e.billingVerified)throw e;failures.push({proxy,error:e.message});continue;}
   for(const row of result.rows)found.set(row.id,row);failures.push(...result.failures);
  }
  if(found.size!==items.length)throw Error('John Lewis source incomplete: '+JSON.stringify(failures.slice(-3)));
  return items.map(item=>found.get(item.id));
 }
 const source={observedAt:checkpoint.startedAt,transport:'John-Lewis-live-exact-official-HTML-shared-Firecrawl-fallback',sourceRequests:0,firecrawlCredits:0,categories:[],families:{},failures:[],complete:false};
 try{
  source.categories=await completeBatch(JL_DIRECTORIES.map(([id,path])=>({id,url:'https://www.johnlewis.com'+path})),true);
  const unique=new Map;for(const c of source.categories)for(const p of [...c.pages,...c.ranges.flatMap(r=>r.pages)])for(const r of p.rows.filter(r=>!r.sponsored&&r.type!=='range-navigation'))unique.set(r.pageProductId,r.sourceUrl);
  const items=[...unique].map(([id,url])=>({id,url}));
  for(let n=0;n<items.length;n+=80){
   for(const r of await completeBatch(items.slice(n,n+80),false)){const f=sanitiseJlFamily(r.product);f.sourceUrl=r.url;f.pageProductId=r.id;f.observedAt=r.observedAt;source.families[r.id]=f;}
   await fs.writeFile(runtime+'/source-checkpoint.json',JSON.stringify(source));console.log(JSON.stringify({phase:'John Lewis exact-family live checkpoint',received:Object.keys(source.families).length,total:items.length,firecrawlCredits:credits}));
  }
  source.uniqueParentCodes=items.length;source.complete=source.categories.length===JL_DIRECTORIES.length&&items.length>0&&Object.keys(source.families).length===items.length;
 }catch(e){source.failures.push({error:e.message});}
 finally{source.firecrawlCredits=credits;source.sourceRequests=requests;source.completedAt=new Date().toISOString();source.billingVerified=receipts.every(r=>r.billingVerified);await fs.writeFile(runtime+'/source.json',JSON.stringify(source));await save();}
 return source;
}
