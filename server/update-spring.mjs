import fs from'node:fs/promises';
import{publishCollectionCheckpoint}from'./collection-checkpoints.mjs';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
import{atomicJson}from'./sync.mjs';
import{collectPartitionedCategory}from'./catalogue-partitions.mjs';
import{loadPolicy,detailFingerprint}from'./collection-policy.mjs';
import{openCreditBudget}from'./credit-budget.mjs';
import{createFirecrawlBrowserReader}from'./firecrawl-browser.mjs';
import{parseDetails,applyDetails}from'./details.mjs';
import{productDimensions}from'../web/catalogue-model.mjs';
import{materialFacts,normaliseColors}from'./appearance.mjs';
import{springSourceDecision,SPRING_VERSION}from'../web/spring-model.mjs';
export const SPRING_SOURCE={id:'375964',url:'https://www.therange.co.uk/home-furnishings/vases-and-artificial-plants/?sort=relevance&in_stock_f=true&page=1'};
export const readSpring=()=>fs.readFile('web/spring/source.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return{products:[],history:{},baselineReady:false};});
export function mergeSpring(previous,listing,at=new Date().toISOString()){
 const prior=new Map(previous.products.map(p=>[String(p.sku),p])),history={...previous.history};
 const products=listing.products.map(row=>{const sku=String(row.sku),old=prior.get(sku),h={...(history[sku]||{firstObservedAt:at,everNew:false,arrivalEvidence:'initial-baseline'})};
  if(row.newIn&&!h.everNew&&previous.baselineReady){h.firstNewObservedAt=at;h.arrivalEvidence='observed-after-baseline';}h.everNew||=row.newIn;history[sku]=h;
  const p={...old,...row,sku,retailerId:'the-range',collectionId:'spring',recordType:'sku',kind:'decoration',priceGBP:row.price/100,currency:'GBP',sourceUrl:'https://www.therange.co.uk/'+row.variantPath.replace('#','/#'),listingVariantImageUrl:row.variantImageUrl||row.imageUrl,newStatus:row.newIn,newEvidence:{kind:'website_flag',field:'newIn',value:row.newIn,observedAt:at},observedAt:at,...h};
  if(!old||detailFingerprint(p)!==old.detailInputFingerprint){p.detailsReady=false;delete p.detailEvidence;delete p.sourceDescription;delete p.specifications;delete p.springAudit;}
  if(old?.listingVariantImageUrl===p.listingVariantImageUrl&&old.imageCacheEvidence){p.variantImageUrl=old.variantImageUrl;p.cachedImageUrl=old.cachedImageUrl;p.imageCacheEvidence=old.imageCacheEvidence;}else{delete p.imageCacheEvidence;delete p.cachedImageUrl;delete p.springAudit;}
  p.springCandidate=springSourceDecision(p);return p;});
 return{...previous,version:SPRING_VERSION,retailerId:'the-range',collectionId:'spring',products,history,observedAt:at,source:{...SPRING_SOURCE,...listing.audit}};
}
export async function updateSpring(){
 const previous=await readSpring();const day=new Date(Date.now()+28800000).toISOString().slice(0,10),cutoff=Date.parse(day+'T06:00:00+08:00');if(process.env.SPRING_RESUME!=='1'&&previous.syncedObservedAt===previous.observedAt&&Date.parse(previous.observedAt)>=cutoff&&process.env.SPRING_FORCE_SOURCE!=='1'){console.log(JSON.stringify({phase:'reuse-current-complete-spring-source',sourceObservedAt:previous.observedAt,firecrawlCredits:0}));return previous;}const policy={...await loadPolicy(),familyBatchSize:100,familyBatchConcurrency:8,familyFetchTimeoutMs:20000,adaptiveFamilies:true,maxRunSeconds:18000,repairImagesOnly:true,imageBodyBatchSize:80,imageBatchProbe:false,imageCheckpoint:'web/spring/image-checkpoint.json'};let reader,budget,snapshot;
 try{budget=await openCreditBudget(policy);reader=await createFirecrawlBrowserReader({policy,budget});
  if(process.env.SPRING_RESUME==='1'&&previous.source?.complete)snapshot=previous;else snapshot=mergeSpring(previous,await collectPartitionedCategory(SPRING_SOURCE.id,reader));
  await atomicJson('web/spring/source.json',snapshot);console.log(JSON.stringify({phase:'spring-complete-source',total:snapshot.products.length,sourceComplete:snapshot.source.complete,candidates:snapshot.products.filter(p=>p.springCandidate.disposition!=='exclude').length}));await publishCollectionCheckpoint({stage:'spring-directory'});await reader.closeBrowser();
  const candidates=snapshot.products.filter(p=>springSourceDecision(p).disposition!=='exclude'),missing=candidates.filter(p=>!p.detailsReady),groups=new Map();for(const p of missing){let u=p.sourceUrl.split('#')[0];if(!groups.has(u))groups.set(u,[]);groups.get(u).push(p);}
  const urls=[...groups.keys()];for(let start=0;start<urls.length;start+=100){const batch=urls.slice(start,start+100).flatMap(u=>groups.get(u));try{await reader.prepareFamilies(batch);}catch(e){console.error(JSON.stringify({phase:'spring-detail-batch',error:e.message}));}
   for(const p of batch)try{const d=parseDetails(await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown']}),p.sku,p.sourceUrl);applyDetails(p,d);p.sourceDescription=d.featuresText;p.dimensions=productDimensions(d.specs,d.featuresText);p.material=materialFacts(d.specs,d.featuresText).label;p.colorValues=normaliseColors(d.specs.Colour||d.specs.Color||'');p.treeColor=p.colorValues.join(' / ');p.detailInputFingerprint=detailFingerprint(p);p.springCandidate=springSourceDecision(p);delete p.detailIssue;}catch(e){p.detailIssue={status:e.status||0,error:e.message,checkedAt:new Date().toISOString()};}
   await atomicJson('web/spring/source.json',snapshot);if(start%300===0)await publishCollectionCheckpoint({stage:'spring-details'});console.log(JSON.stringify({phase:'spring-details-progress',familiesDone:Math.min(start+100,urls.length),familiesTotal:urls.length,verified:candidates.filter(p=>p.detailsReady).length}));
  }
  const photoProducts=candidates.filter(p=>springSourceDecision(p).disposition!=='exclude');
  snapshot.imageAudit=await reader.auditImages(photoProducts,snapshot.imageAudit||{},{bodyBatchSize:80});
  await atomicJson('web/spring/source.json',snapshot);await reader.close();const native=reader.metrics();await budget.settle({credits:native.firecrawlCredits,receipt:native.receipt,report:{mode:'range-spring',native,products:snapshot.products.length}});snapshot.collectionAudit={native,completedAt:new Date().toISOString()};await atomicJson('web/spring/source.json',snapshot);console.log(JSON.stringify({phase:'spring-collected',total:snapshot.products.length,verified:photoProducts.filter(p=>p.detailsReady).length,images:snapshot.imageAudit.loaded,failed:snapshot.imageAudit.failed,native}));
 }catch(e){await reader?.close().catch(()=>{});const native=reader?.metrics()||{};await budget?.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'range-spring',error:e.message,native}});if(snapshot){snapshot.collectionError={error:e.message,at:new Date().toISOString()};await atomicJson('web/spring/source.json',snapshot);}throw e;}finally{await reader?.close();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1])))await updateSpring();
