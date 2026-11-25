import{detailFingerprint}from'./collection-policy.mjs';
const arrival=p=>p.everNew&&p.arrivalEvidence==='observed-after-baseline'&&Number.isFinite(Date.parse(p.firstNewObservedAt));
export const springPendingArrival=p=>arrival(p)&&p.springAudit?.disposition!=='exclude'&&(!p.detailsReady||!p.springNativePhotoVerified||p.springAudit?.disposition!=='include');
export function springDailyDetailPlan(previous,candidates){
 const prior=new Map((previous.products||[]).map(p=>[String(p.sku),p]));
 return candidates.filter(p=>{const old=prior.get(String(p.sku));return !old||detailFingerprint(old)!==detailFingerprint(p)||arrival(p)&&(!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku));});
}
