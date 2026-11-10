import {pinMailAssets} from '../cloud/published-mail-assets.mjs';
import {NOTIFICATION_CONTRACT} from '../cloud/notification-evidence.mjs';
import {christmasEligibility,offeredObject,isPublishedProduct} from '../web/taxonomy.mjs';

const key=p=>(p.retailerId||'the-range')+':'+p.sku;
export async function recoverCommittedNotifications({pending,products,revision,readManifest,verifyOriginal,controlCall}){
 const current=new Map(products.map(p=>[key(p),p])),report={phase:'recover-committed-notifications',queued:0,alreadyRecorded:0,excluded:[],deferred:[],firecrawlCredits:0,sourceRequestsMade:false};
 for(const candidate of pending.candidates){
  try{
   const saved=current.get(key(candidate));if(!saved)throw Error('Pending SKU not present in the verified catalogue');
   if(candidate.unavailableSince||!isPublishedProduct(saved)||!['asda','ms','bm'].includes(saved.retailerId)&&christmasEligibility(saved,offeredObject(saved)).disposition!=='include'){report.excluded.push(candidate.sku);continue;}
   const m=await readManifest(saved);if(m.sku!==String(saved.sku)||m.sourceUrl!==saved.sourceUrl||m.priceGBP!==saved.priceGBP||String(saved.detailEvidence?.selectedSku)!==String(saved.sku)||!saved.detailEvidence?.verifiedProductSection||!Number.isFinite(Date.parse(saved.attributeObservedAt)))throw Error('Saved notification and selected-SKU details do not match');
   await verifyOriginal(saved,m);
   const p={...saved,newStatus:true,originalImageUrl:m.original.sourceUrl,originalImageEvidence:{sourceUrl:m.original.sourceUrl,sha256:m.original.sha256,width:m.original.width,height:m.original.height,observedAt:saved.attributeObservedAt},mailAssets:pinMailAssets(m,revision),screenshotKind:m.evidenceMode||m.notification?.kind};
   const r=await controlCall(p.retailerId==='bm'?'/internal/bm-event':p.retailerId==='ms'?'/internal/ms-event':p.retailerId==='asda'?'/internal/asda-event':'/internal/recover-event',{notificationTransport:NOTIFICATION_CONTRACT,product:p,screenshotVerifiedAt:saved.attributeObservedAt});
   if(r.recorded)report.queued++;else if(r.alreadyRecorded)report.alreadyRecorded++;else throw Error('Notification was not durably acknowledged');
  }catch(e){report.deferred.push({sku:candidate.sku,status:e.status||0,reason:String(e.message).slice(0,220)});}
 }
 return report;
}
