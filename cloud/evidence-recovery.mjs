import {sourceDay,sourceRecovery} from './source-recovery.mjs';
export const MONITOR_PIPELINE_VERSION='2026-11-09-stage-isolation-v1';
export const MAX_EVIDENCE_ATTEMPTS=3;
export function evidenceDeadline(sourceAt){
 const at=Date.parse(sourceAt);if(!Number.isFinite(at))return null;
 const midnight=Date.parse(sourceDay(at)+'T16:00:00Z');
 return new Date(Math.min(at+6*3600000,midnight)).toISOString();
}
export function evidenceRetryDue(m,now=Date.now()){
 return m?.evidenceRetryDay===sourceDay(now)&&m.evidenceAttempts<MAX_EVIDENCE_ATTEMPTS&&Date.parse(m.evidenceRetryAt)<=now&&now<Date.parse(m.evidenceDeadlineAt);
}
export function evidenceRecovery(previous,{success,retryable=false,sourceAt=previous.evidenceSourceAt,now=Date.now()}){
 const day=sourceDay(now);
 if(success)return {evidenceRetryDay:day,evidenceAttempts:0,evidenceRetryAt:null,evidenceRetryExhausted:false,evidenceSourceAt:null,evidenceDeadlineAt:null};
 const attempts=(previous.evidenceRetryDay===day&&previous.evidenceSourceAt===sourceAt?previous.evidenceAttempts||0:0)+1,deadline=evidenceDeadline(sourceAt),at=now+(attempts===1?5:15)*60000;
 const allowed=retryable&&attempts<MAX_EVIDENCE_ATTEMPTS&&at<Date.parse(deadline)&&sourceDay(at)===day;
 return {evidenceRetryDay:day,evidenceAttempts:attempts,evidenceRetryAt:allowed?new Date(at).toISOString():null,evidenceRetryExhausted:retryable&&!allowed,evidenceSourceAt:sourceAt||null,evidenceDeadlineAt:deadline};
}
export function retryableEvidence(result){
 const issues=result.issues||[];
 if(result.deferred>0&&!issues.length)return true;
 return issues.some(e=>e.budgetLimited||[0,403,408,429,500,502,503,504].includes(e.status)||/HTTP 50\d|fetch failed|network|timeout|timed out|连接|预算|积分|付费.*上限/i.test(String(e.reason||e.error||'')));
}
export function completeMonitorState(previous,b,delivery={},now=Date.now()){
 const sourceReady=b.catalogueReady===true,sourceAt=b.sourceObservedAt||previous.evidenceSourceAt||previous.lastDiscoverySuccess;
 const evidence=sourceReady?evidenceRecovery(previous,{success:b.success,retryable:b.evidenceRetryable===true,sourceAt,now}):evidenceRecovery(previous,{success:true,now});
 const state=b.success?(delivery.pendingDeliveries?'delivery-pending':'active'):sourceReady?(evidence.evidenceRetryAt?'evidence-pending':'evidence-blocked'):'error';
 return {...previous,...delivery,...sourceRecovery(previous,{success:b.success||sourceReady,retryable:b.retryable===true,now}),...evidence,state,stage:b.success?(delivery.pendingDeliveries?'delivery':'complete'):sourceReady?'evidence':'discovery',checkedAt:new Date(now).toISOString(),lastDiscoverySuccess:sourceReady?sourceAt:previous.lastDiscoverySuccess||null,lastSuccess:b.success?new Date(now).toISOString():previous.lastSuccess||null,lastError:b.success?null:String(b.error||'本阶段尚未完成').slice(0,200),scanned:b.scanned||0,newCount:b.newCount||0};
}
