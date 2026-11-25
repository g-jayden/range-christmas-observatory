import{SPRING_MONITOR_CONTRACT}from'../web/spring-monitor-contract.mjs';
import{SPRING_VERSION,SPRING_DEPARTMENTS,isSpringScope}from'../web/spring-model.mjs';

// Old review items remain explicitly unapproved. Discovery uses all official
// inventory rows; only individually verified new arrivals enter the PDF queue.
export async function syncSpringInventory({body:b,storage:db,ownerId,verifyProduct,now=new Date().toISOString()}){
 const epoch=Date.parse(b?.observedAt),time=Date.parse(now),s=b?.source,n=s?.expected;
 if(b?.contract!==SPRING_MONITOR_CONTRACT||b.version!==SPRING_VERSION||b.collectionId!=='spring'||b.collectionComplete!==true||!s?.complete||!Number.isInteger(n)||n<1||s.observed!==n||s.unique!==n||!Array.isArray(b.inventory)||b.inventory.length!==n||!Array.isArray(b.products)||!Number.isFinite(epoch)||epoch>time||!/^[a-f0-9]{40}$/.test(b.committedRevision||'')||!Number.isInteger(b.reviewPending)||b.reviewPending<0||b.reviewComplete!==(b.reviewPending===0)||b.ready!==b.reviewComplete)throw Error('Complete committed Spring inventory and truthful review accounting required');
 const baselineEpoch=Date.parse(b.discoveryBaselineAt);if(!Number.isFinite(baselineEpoch)||baselineEpoch>epoch)throw Error('Original Spring discovery baseline required');
 const inventory=new Map,current=new Map,aliases=new Map;
 for(const r of b.inventory){if(!/^\d{1,12}$/.test(r.sku)||inventory.has(r.sku)||!/^\d+$/.test(r.variantId)||!['include','exclude','review'].includes(r.disposition)||typeof r.inStock!=='boolean'||typeof r.newStatus!=='boolean'||typeof r.everNew!=='boolean')throw Error('Exact Spring inventory identity required');if(r.firstNewObservedAt&&(!Number.isFinite(Date.parse(r.firstNewObservedAt))||Date.parse(r.firstNewObservedAt)>epoch))throw Error('Invalid Spring arrival observation');inventory.set(r.sku,r);}
 if([...inventory.values()].filter(r=>r.disposition==='review').length!==b.reviewPending)throw Error('Spring pending inventory count mismatch');
 for(const p of b.products){
  const row=inventory.get(p.sku),d=p.detailEvidence,a=p.springAudit;
  if(!row||row.disposition!=='include'||row.variantId!==String(p.variantId)||!row.inStock||p.everNew!==row.everNew||p.newStatus!==row.newStatus||p.arrivalEvidence!==row.arrivalEvidence||p.firstNewObservedAt!==row.firstNewObservedAt||p.retailerId!=='the-range'||p.collectionId!=='spring'||p.inStock!==true||p.observedAt!==b.observedAt||!Number.isFinite(p.priceGBP)||p.priceGBP<0||current.has(p.sku)||p.departmentIds?.length!==1||!isSpringScope(p.department)||p.departmentIds[0]!==p.department||a?.version!==SPRING_VERSION||a.disposition!=='include'||p.classificationEvidence?.requiresReview||p.springNativePhotoVerified!==true||p.detailsReady!==true||d?.verifiedProductSection!==true||String(d.selectedSku)!==p.sku||!/^[a-f0-9]{64}$/.test(d.sourceContentHash||'')||a.sourceContentHash!==d.sourceContentHash||!/^[a-f0-9]{64}$/.test(p.originalImageEvidence?.sha256||'')||a.imageHash!==p.originalImageEvidence.sha256)throw Error('Individually accepted exact-SKU Spring product required');
  verifyProduct(p);current.set(p.sku,p);for(const sku of[p.sku,...p.aliasSkus||[]]){if(aliases.has(String(sku)))throw Error('Duplicate Spring product alias');aliases.set(String(sku),p.sku);}
 }
 if([...inventory.values()].some(r=>r.disposition==='include'&&!aliases.has(r.sku)))throw Error('Accepted Spring inventory SKU omitted');
 const previous=await db.get('spring-monitor');if(Date.parse(previous?.observedAt)>epoch)return{ignored:true,reason:'newer-inventory-already-committed',baselineReady:true,products:current.size};
 if(!await db.get('baseline/range-spring-v1'))await db.put('baseline/range-spring-v1',{contract:SPRING_MONITOR_CONTRACT,observedAt:b.discoveryBaselineAt,products:n});
 const arrival=r=>r.everNew&&r.arrivalEvidence==='observed-after-baseline'&&Date.parse(r.firstNewObservedAt)>baselineEpoch;
 // Historic NEW items, including old pending review items, are not reannounced
 // when their classification or photograph is eventually repaired.
 for(const r of inventory.values())if(r.everNew&&!arrival(r)&&!await db.get('pending/'+r.sku)&&!await db.get('event/'+r.sku))await db.put('seen/'+r.sku,true);
 for(const p of current.values()){
  const related=[p.sku,...p.aliasSkus||[]],row=inventory.get(p.sku),seen=(await Promise.all(related.map(s=>db.get('seen/'+s)))).some(Boolean);
  if(seen){for(const s of related)await db.put('seen/'+s,true);continue;}
  if(arrival(row)){const old=await db.get('pending/'+p.sku);if(!old||old.collectionId==='spring')await db.put('pending/'+p.sku,{...p,firstDetectedAt:old?.firstDetectedAt||p.firstNewObservedAt||row.firstNewObservedAt});}
 }
 let evidencePending=0;
 for(const r of inventory.values())if(r.inStock&&r.disposition==='review'&&arrival(r)&&!await db.get('seen/'+r.sku)){const old=await db.get('pending/'+r.sku),event=await db.get('event/'+r.sku);if((!old||old.collectionId==='spring')&&(!event||event.collectionId==='spring'))evidencePending++;}
 for(const[key,p]of await db.list({prefix:'pending/'}))if(p.collectionId==='spring'){
  const row=inventory.get(p.sku);if((!row||!row.inStock||row.disposition==='exclude')&&!p.unavailableSince)await db.put(key,{...p,unavailableSince:now});
 }
 const day=new Date(time+28800000).toISOString().slice(0,10),sourceFresh=epoch>=Date.parse(day+'T06:00:00+08:00');
 if(sourceFresh&&/^[a-f0-9]{64}$/.test(ownerId||'')&&!await db.get('spring-owner-opt-in')){const sub=await db.get('sub/'+ownerId);if(sub?.confirmedAt){await db.put('sub/'+ownerId,{...sub,scopes:[...new Set([...sub.scopes,...SPRING_DEPARTMENTS.map(d=>d.id)])]});await db.put('spring-owner-opt-in',now);}}
 await db.put('spring-monitor',{contract:SPRING_MONITOR_CONTRACT,observedAt:b.observedAt,checkedAt:now,inventoryProducts:n,products:current.size,reviewPending:b.reviewPending,reviewComplete:b.reviewComplete,evidencePending,automaticArrivalChecks:true,collectionComplete:true,committedRevision:b.committedRevision});
 return{baselineReady:true,products:current.size,inventoryProducts:n,reviewPending:b.reviewPending,evidencePending,sourceFresh,ownerSubscriptionConfigured:Boolean(await db.get('spring-owner-opt-in'))};
}
