const KEY='data-publication-lease',QUEUE='data-publication-waiters',TTL=120000,WAITER_TTL=180000;
// The lock covers the short Git publication, never the retailer scan. FIFO
// prevents an original-image batch from repeatedly overtaking a waiting scan.
export async function dataPublicationLease({storage,body,now=Date.now()}){
 if(!/^\d{1,20}-\d{1,6}$/.test(body?.owner||'')||!['acquire','renew','release'].includes(body?.operation))throw Error('Invalid data publication lease');
 const{owner,operation}=body;let result;
 await storage.transaction(async db=>{
  const prior=await db.get(KEY);let queue=(await db.get(QUEUE)||[]).filter(q=>q.lastSeenAt+WAITER_TTL>now);
  if(operation==='release'){
   if(prior?.owner===owner)await db.delete(KEY);
   queue=queue.filter(q=>q.owner!==owner);await db.put(QUEUE,queue);
   result={released:!prior||prior.owner===owner};return;
  }
  if(operation==='renew'){
   if(prior?.owner!==owner||prior.expiresAt<=now){result={acquired:false};return;}
   await db.put(KEY,{owner,expiresAt:now+TTL});result={acquired:true,expiresAt:now+TTL};return;
  }
  if(prior?.owner===owner&&prior.expiresAt>now){await db.put(KEY,{owner,expiresAt:now+TTL});result={acquired:true,expiresAt:now+TTL};return;}
  const existing=queue.find(q=>q.owner===owner);if(existing)existing.lastSeenAt=now;else queue.push({owner,queuedAt:now,lastSeenAt:now});
  if((!prior||prior.expiresAt<=now)&&queue[0]?.owner===owner){
   await db.put(KEY,{owner,expiresAt:now+TTL});queue.shift();result={acquired:true,expiresAt:now+TTL};
  }else result={acquired:false,retryAfterMs:3000,position:queue.findIndex(q=>q.owner===owner)+1};
  await db.put(QUEUE,queue);
 });
 return{...result,sourceRequestsMade:false,firecrawlCredits:0};
}
