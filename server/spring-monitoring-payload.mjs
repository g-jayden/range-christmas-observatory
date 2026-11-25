import{SPRING_MONITOR_CONTRACT}from'../web/spring-monitor-contract.mjs';
import{SPRING_VERSION}from'../web/spring-model.mjs';
import{verifiedSpringBrowse}from'./spring-browse-publication.mjs';
import{springNotificationFacts}from'./spring-notification-payload.mjs';

// Complete inventory coverage establishes discovery. Every exportable product
// still passes the unchanged exact description/native-photo acceptance gate.
export function springMonitoringPayload({source,catalogue,review,status},committedRevision){
 const accepted=verifiedSpringBrowse(catalogue,review,status);
 if(!/^[a-f0-9]{40}$/.test(committedRevision||'')||source?.observedAt!==accepted.observedAt||!source.source?.complete||source.products?.length!==accepted.source.expected||source.source.expected!==accepted.source.expected)throw Error('Committed complete Spring inventory required');
 if(['id','url','expected','observed','unique','complete'].some(k=>source.source[k]!==accepted.source[k]))throw Error('Mixed Spring inventory directory evidence');
 const seen=new Set,acceptedSkus=new Set(accepted.products.flatMap(p=>[String(p.sku),...(p.aliasSkus||[]).map(String)])),inventory=[];
 for(const p of source.products){
  const sku=String(p.sku),disposition=p.springAudit?.disposition;
  if(!/^\d{1,12}$/.test(sku)||seen.has(sku)||p.retailerId!=='the-range'||p.collectionId!=='spring'||p.observedAt!==accepted.observedAt||p.springAudit?.version!==SPRING_VERSION||!['include','exclude','review'].includes(disposition)||disposition==='include'&&!acceptedSkus.has(sku))throw Error('Unaccounted exact Spring inventory SKU '+sku);
  seen.add(sku);inventory.push({sku,variantId:String(p.variantId),disposition,inStock:p.inStock===true,newStatus:p.newStatus===true,everNew:p.everNew===true,arrivalEvidence:p.arrivalEvidence,firstNewObservedAt:p.firstNewObservedAt});
 }
 // The PDF builder resolves all measurements and full NEW evidence from the
 // committed candidate catalogue. Repeating those large objects for every old
 // product is unnecessary in the private discovery/queue request.
 const products=accepted.products.map(p=>{const{dimensions,newEvidence,...facts}=springNotificationFacts(p);return facts;});
 return{contract:SPRING_MONITOR_CONTRACT,version:SPRING_VERSION,collectionId:'spring',collectionComplete:true,ready:accepted.ready,reviewComplete:accepted.reviewComplete,reviewPending:accepted.reviewPending,observedAt:accepted.observedAt,discoveryBaselineAt:source.discoveryBaselineAt||source.observedAt,committedRevision,source:Object.fromEntries(['id','url','expected','observed','unique','complete'].filter(k=>accepted.source[k]!==undefined).map(k=>[k,accepted.source[k]])),inventory,products};
}
