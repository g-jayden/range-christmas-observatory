import{createHash}from'node:crypto';
// Interleave retailers so one blocked source cannot consume the entire job.
// Stop before the runner timeout, leaving explicit pending work and enough time
// to close the paid session, record its receipt, and commit recovered originals.
export function publishedNativeCandidates(rows){return rows.filter(p=>p.sourceListed!==false&&p.inStock===true&&p.recordType==='sku'&&Boolean(p.department||(p.departmentIds||[]).length)&&(!p.taxonomyAudit||p.taxonomyAudit.disposition==='include'));}
export function prioritizePendingOriginals(entries,previous={}){
 const key=e=>e.source||e.retailerId+':'+e.sku,pending=new Set((previous.pending||[]).map(key)),failed=new Set((previous.issues||[]).map(key));
 const rank=e=>pending.has(key(e))?0:failed.has(key(e))?2:1;return [...entries].sort((a,b)=>rank(a)-rank(b));
}
export async function recoverNativeBatch(entries,{reuse,recover,close,checkpoint=async()=>{},now=Date.now,budgetMs=30*60*1000,checkpointEvery=50,concurrency=4}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw Error('Native recovery concurrency must be between one and eight');
 const started=now(),groups=new Map();for(const entry of entries){const group=groups.get(entry.retailerId)||[];group.push(entry);groups.set(entry.retailerId,group);}
 const queue=[],positions=new Map();while(queue.length<entries.length)for(const[id,group]of groups){const i=positions.get(id)||0;if(i<group.length){queue.push(group[i]);positions.set(id,i+1);}}
 const status={total:queue.length,processed:0,reused:0,recovered:0,issues:[],pending:[],scanComplete:false,complete:false,deadlineReached:false};
 const finished=new Set();let cursor=0;
 const snapshot=()=>({...status,pending:queue.filter((_,i)=>!finished.has(i)).map(({retailerId,sku,source})=>({retailerId,sku,source})),checkedAt:new Date(now()).toISOString()});
 try{
  const workers=await Promise.allSettled(Array.from({length:Math.min(concurrency,queue.length)},async()=>{while(cursor<queue.length){
   if(now()-started>=budgetMs){status.deadlineReached=true;break;}const index=cursor++,entry=queue[index];
   try{if(await reuse(entry))status.reused++;else{await recover(entry);status.recovered++;}}
   catch(e){status.issues.push({retailerId:entry.retailerId,sku:entry.sku,source:entry.source,error:String(e.message).slice(0,200),...(e.code?{code:e.code}:{})});}
   finished.add(index);status.processed++;if(status.processed%checkpointEvery===0)await checkpoint(snapshot());
  }}));const failure=workers.find(r=>r.status==='rejected');if(failure)throw failure.reason;
 }finally{await close();}
 status.scanComplete=status.processed===queue.length;status.complete=status.scanComplete&&status.issues.length===0;
 const result=snapshot();await checkpoint(result);return result;
}

export function nativeAuditFingerprint(entries,{mirrors={},trackedBlobs=new Map()}={}){const rows=entries.map(({retailerId,sku,source,product:p={}})=>{const e=p.originalImageEvidence||{},m=mirrors[source]||{},key=retailerId+':'+sku;return{retailerId,sku,source,page:p.sourceUrl,variantId:p.variantId,selected:p.originalImageUrl,declared:{sha256:e.sha256,source:e.sourceUrl,selectedSku:e.selectedSku,width:e.width,height:e.height,sourceVersion:e.sourceVersion},gallery:(p.originalImages||[]).filter(g=>g.url===source),conflict:p.sourceImageConflict||p.sourceConflict,localBlob:trackedBlobs.get('web/'+p.originalCachedImageUrl)||null,mirror:{ok:m.ok===true&&m.bindings?.includes(key),hash:m.hash,blob:trackedBlobs.get('web/'+m.cachedImageUrl)||null}};}).sort((a,b)=>(a.retailerId+':'+a.sku+'|'+a.source).localeCompare(b.retailerId+':'+b.sku+'|'+b.source));return createHash('sha256').update(JSON.stringify({version:'exact-native-source-inputs-v1',rows})).digest('hex');}
export function canReuseNativeAudit(previous,fingerprint){if(previous?.sourceInputsFingerprint!==fingerprint||previous.scanComplete!==true||previous.pending?.length!==0)return false;if(previous.complete===true&&previous.issues?.length===0)return true;return previous.issues?.length>0&&previous.issues.every(i=>!i.source&&i.error==='Exact official public image target required'||i.error==='Paid original must belong to this exact SKU gallery'||/official-title-photo|Official title says Red & Gold|官网标题为红色/i.test(i.error||''));}
