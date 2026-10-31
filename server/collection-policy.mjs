import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
export const defaults={version:1,retailerId:'the-range-gb',catalogueId:'christmas-trees-skirts',provider:'native',firecrawlEnabled:false,detailMaxAgeDays:0,maxDetailPagesPerRun:10000,maxScreenshotPagesPerRun:1000,maxCreditsPerRun:0,maxCreditsPerCalendarMonth:0,accountReserveCredits:0,maxNativePagesPerRun:20000,browserConcurrency:4,catalogueReuseHours:0,failureRetryDays:[1,3,7,30],permanentFailureRetryDays:0};
export async function loadPolicy(file='web/collection-policy.json'){
 let supplied={};try{supplied=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 const p={...defaults,...supplied};
 for(const key of ['detailMaxAgeDays','maxDetailPagesPerRun','maxScreenshotPagesPerRun','maxCreditsPerRun','maxCreditsPerCalendarMonth','accountReserveCredits','catalogueReuseHours','permanentFailureRetryDays'])if(!Number.isFinite(p[key])||p[key]<0)throw Error('Invalid collection policy: '+key);
 if(!/^[a-z0-9-]+$/.test(p.retailerId)||!Array.isArray(p.failureRetryDays)||!p.failureRetryDays.length||p.failureRetryDays.some(n=>!Number.isFinite(n)||n<1))throw Error('Invalid retailer or retry policy');
 return p;
}
export const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const productKey=(p,policy)=>policy.retailerId+':'+String(p.sku);
export function detailFingerprint(p){
 return digest({sku:String(p.sku),productPath:p.productPath||p.sourceUrl?.split('#')[0],variantId:p.variantId,variantName:p.variantName,brand:p.brand,kind:p.kind,variantImage:p.listingVariantImageUrl??p.variantImageUrl,image:p.imageUrl});
}
export function verified(p){return Boolean(p.attributeObservedAt&&p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku).replace(/^0+(?=\d)/,'')===String(p.sku).replace(/^0+(?=\d)/,''));}
export function unchangedDetailInput(prior,p){
 if(!prior)return false;
 // Before the first incremental run, old PDP image overrides have no raw-listing field.
 if(!prior.detailInputFingerprint&&prior.imageEvidence&&!prior.listingVariantImageUrl){
  return ['productPath','variantId','variantName','brand','imageUrl'].every(k=>prior[k]===p[k]);
 }
 return (prior.detailInputFingerprint||detailFingerprint(prior))===detailFingerprint(p);
}
export function seedFailures(previous,failures,policy){
 for(const issue of previous.detailsAudit?.issues||[]){
  const p=previous.products.find(p=>p.sku===issue.sku);if(!p||verified(p))continue;
  const key=productKey(p,policy);if(failures[key])continue;
  const at=Date.parse(p.detailCheckedAt||previous.detailsAudit.completedAt||previous.observedAt);
  if(Number.isFinite(at))failures[key]={fingerprint:detailFingerprint(p),attempts:1,lastAttemptAt:new Date(at).toISOString(),retryAt:new Date(at+policy.permanentFailureRetryDays*86400000).toISOString(),error:issue.reason||issue.error||'此前SKU核验未通过'};
 }
}
export function failedAttempt(p,error,failures,policy,now=Date.now(),suffix=''){
 const key=productKey(p,policy)+suffix,old=failures[key],fingerprint=detailFingerprint(p),attempts=old?.fingerprint===fingerprint?(old.attempts||0)+1:1;
 const permanent=/SKU.*(?:match|匹配)|同系列|控制字符|HTTP 40[034]|non-200|invalid.*URL/i.test(error);
 const days=permanent?policy.permanentFailureRetryDays:policy.failureRetryDays[Math.min(attempts-1,policy.failureRetryDays.length-1)];
 failures[key]={fingerprint,attempts,lastAttemptAt:new Date(now).toISOString(),retryAt:new Date(now+days*86400000).toISOString(),error:String(error).slice(0,300)};
 return failures[key];
}
export function planDetails(previous,next,{policy,failures={},now=Date.now(),limit=policy.maxDetailPagesPerRun,completed=new Set()}={}){
 const old=new Map(previous.products.map(p=>[p.sku,p])),queue=[],reused=[],backoff=[],invalid=[];
 for(const p of next.products){
  const prior=old.get(p.sku),same=unchangedDetailInput(prior,p),key=productKey(p,policy),failure=failures[key],fingerprint=detailFingerprint(p);
  p.retailerId=policy.retailerId;
  if(/[\u0000-\u001f]/.test(p.sourceUrl||'')){invalid.push({sku:p.sku,reason:'原站链接格式异常，等待目录地址修复；不重复付费请求'});continue;}
  const currentProof=verified(p)&&p.detailInputFingerprint===fingerprint;
  if(currentProof&&completed.has(key)){reused.push(p.sku);continue;}
  const trusted=(currentProof||same&&verified(prior))&&verified(p);
  if(trusted)p.detailInputFingerprint=fingerprint;
  if(failure&&failure.fingerprint===fingerprint&&Date.parse(failure.retryAt)>now){backoff.push({sku:p.sku,retryAt:failure.retryAt,reason:failure.error});continue;}
  const observed=Date.parse(p.attributeObservedAt),expired=!Number.isFinite(observed)||now-observed>=policy.detailMaxAgeDays*86400000;
  const reason=currentProof&&!expired?null:!prior?'new-sku':!same&&!currentProof?'metadata-changed':!trusted?'missing-proof':expired?'aged-proof':null;
  if(!reason){p.detailStatus='复用已核验档案，核验日期保留';reused.push(p.sku);continue;}
  if(reason==='metadata-changed'){
   p.previousAttributeEvidence={height:p.heightLabel,colour:p.treeColor,observedAt:p.attributeObservedAt};
   p.attributeObservedAt=null;p.heightLabel='高度未确认';p.heightCm=null;p.heightValues=[];p.treeColor='颜色未确认';p.colorValues=[];p.material='材质未确认';
   p.skirtDiameterCm=null;p.skirtBaseDiameterCm=null;p.skirtTopDiameterCm=null;delete p.specifications;delete p.detailEvidence;delete p.productSummary;
   p.features={...(p.listingFeatures||{})};p.style=[['potted','圣诞树盆栽'],['popUp','折叠式圣诞树'],['slim','纤细圣诞树'],['snow','雪景款'],['prelit','预亮灯款']].find(([key])=>p.features[key])?.[1]||'标准／其他装饰待核验';
  }
  queue.push({product:p,key,fingerprint,reason,priority:reason==='new-sku'?0:reason==='metadata-changed'?1:reason==='missing-proof'?2:3,observed:Number.isFinite(observed)?observed:0});
 }
 queue.sort((a,b)=>a.priority-b.priority||a.observed-b.observed||a.key.localeCompare(b.key));
 const selected=queue.slice(0,Math.max(0,Math.floor(limit))),deferred=queue.slice(selected.length);
 for(const item of deferred)item.product.detailStatus='详情待轮到预算内核验；保留原核验日期';
 return {selected,deferred,reused,backoff,invalid,eligible:queue.length};
}
export const imageMapFingerprint=products=>digest(products.map(p=>[String(p.sku),p.variantImageUrl||p.imageUrl||'']).sort((a,b)=>a[0].localeCompare(b[0])));
