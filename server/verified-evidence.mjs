import fs from 'node:fs/promises';
import {atomicJson} from './sync.mjs';
import {detailFingerprint} from './collection-policy.mjs';
import {productInformation} from './details.mjs';
export const DETAIL_EVIDENCE_FIELDS=['detailEvidence','attributeObservedAt','specifications','sourceDescription','productSummary','dimensions','material','colorValues','treeColor','sourceColour','sourceMaterial','appearanceSource','images','originalImages','originalImageUrl','originalSourceEvidence','originalImageEvidence','originalCachedImageUrl','heightLabel','heightCm','heightValues','style','styleEvidence','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm'];
const text=s=>String(s||'').replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replaceAll('&amp;','&').normalize('NFKC').replace(/\s+/g,' ').trim();
const canonical=raw=>{try{const u=new URL(raw);return u.origin==='https://www.therange.co.uk'?u.origin+u.pathname.replace(/\/$/,''):null}catch{return null}};
export const hasVerifiedDetails=p=>Boolean(p?.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===String(p.sku)&&Number.isFinite(Date.parse(p.attributeObservedAt)));
export function sameEvidenceIdentity(p,q){const resolved=q?.sourceResolutionEvidence;return Boolean(p&&q&&String(p.sku)===String(q.sku)&&canonical(p.sourceUrl)&&(canonical(p.sourceUrl)===canonical(q.sourceUrl)||resolved?.method==='official-search-and-exact-SKU-JSON'&&String(resolved.selectedSku)===String(p.sku)&&canonical(resolved.inputUrl)===canonical(p.sourceUrl)&&canonical(resolved.resolvedUrl)===canonical(q.sourceUrl))&&text(p.variantName)===text(q.variantName)&&(!p.variantId||!q.variantId||String(p.variantId)===String(q.variantId))&&(p.listingVariantImageUrl||p.variantImageUrl||p.imageUrl)===(q.listingVariantImageUrl||q.variantImageUrl||q.imageUrl));}
export function bestVerifiedEvidence(p,candidates){
 return candidates.filter(q=>hasVerifiedDetails(q)&&sameEvidenceIdentity(p,q)&&(!p.detailRequiredAfter||Date.parse(q.attributeObservedAt)>=Date.parse(p.detailRequiredAfter))&&(!p.detailIssue?.observedAt||Date.parse(q.attributeObservedAt)>=Date.parse(p.detailIssue.observedAt))&&(!p.previousDetailEvidence||!p.detailCheckedAt||Date.parse(q.attributeObservedAt)>=Date.parse(p.detailCheckedAt))).sort((a,b)=>Date.parse(b.attributeObservedAt)-Date.parse(a.attributeObservedAt))[0];
}
export function reconcileVerifiedEvidence(snapshots){
 const by=new Map();for(const s of snapshots.filter(Boolean))for(const p of s.products||[]){if(!by.has(String(p.sku)))by.set(String(p.sku),[]);by.get(String(p.sku)).push(p);}
 const restored=[];
 for(const s of snapshots.filter(Boolean))for(const p of s.products||[]){const q=bestVerifiedEvidence(p,by.get(String(p.sku))||[]);if(!q||q===p||hasVerifiedDetails(p)&&Date.parse(p.attributeObservedAt)>=Date.parse(q.attributeObservedAt))continue;
  if(canonical(p.sourceUrl)!==canonical(q.sourceUrl)){p.rawSourceUrl=p.sourceUrl;p.sourceUrl=q.sourceUrl;p.sourceResolutionEvidence=structuredClone(q.sourceResolutionEvidence);}
  for(const key of DETAIL_EVIDENCE_FIELDS)if(q[key]!==undefined&&(key!=='style'||q.kind===p.kind))p[key]=structuredClone(q[key]);p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);delete p.detailIssue;delete p.detailError;
  if(p.specifications)p.productSummary=productInformation(p,p.specifications).summary;
  p.detailReuseEvidence={method:'exact-SKU-unchanged-source-identity',sourceUrl:q.sourceUrl,verifiedAt:q.attributeObservedAt,restoredAt:new Date().toISOString(),firecrawlCredits:0};restored.push({sku:p.sku,verifiedAt:q.attributeObservedAt});
 }
 return {restored:restored.length,records:restored,sourceRequestsMade:false,firecrawlCredits:0};
}
export async function restoreVerifiedRegistry(products){
 const buckets=new Map(),saved=[];for(const p of products){const k=String(p.sku).slice(-2).padStart(2,'0');if(!buckets.has(k))buckets.set(k,await fs.readFile('web/verified-detail-registry/'+k+'.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return {}}));const q=buckets.get(k)[p.sku];if(q)saved.push(q);}
 return reconcileVerifiedEvidence([{products},{products:saved}]);
}
export async function saveVerifiedRegistry(products){
 const buckets=new Map(),dirty=new Set();for(const p of products.filter(hasVerifiedDetails)){const k=String(p.sku).slice(-2).padStart(2,'0');if(!buckets.has(k))buckets.set(k,await fs.readFile('web/verified-detail-registry/'+k+'.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return {}}));const rows=buckets.get(k),q=rows[p.sku];if(q&&Date.parse(q.attributeObservedAt)>Date.parse(p.attributeObservedAt))continue;
  const kept=['sku','kind','variantId','variantName','sourceUrl','sourceResolutionEvidence','listingVariantImageUrl','variantImageUrl','imageUrl',...DETAIL_EVIDENCE_FIELDS];const record=Object.fromEntries(kept.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));if(JSON.stringify(q)!==JSON.stringify(record)){rows[p.sku]=record;dirty.add(k);}
 }for(const k of dirty)await atomicJson('web/verified-detail-registry/'+k+'.json',buckets.get(k));return {savedBuckets:dirty.size,firecrawlCredits:0};
}
