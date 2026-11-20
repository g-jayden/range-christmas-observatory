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
   catch(e){status.issues.push({retailerId:entry.retailerId,sku:entry.sku,source:entry.source,error:String(e.message).slice(0,200)});}
   finished.add(index);status.processed++;if(status.processed%checkpointEvery===0)await checkpoint(snapshot());
  }}));const failure=workers.find(r=>r.status==='rejected');if(failure)throw failure.reason;
 }finally{await close();}
 status.scanComplete=status.processed===queue.length;status.complete=status.scanComplete&&status.issues.length===0;
 const result=snapshot();await checkpoint(result);return result;
}
