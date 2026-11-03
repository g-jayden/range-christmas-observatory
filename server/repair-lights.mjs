import {readLights,updateLightingDetails,publishLights} from './lights.mjs';
import {createFirecrawlBrowserReader} from './firecrawl-browser.mjs';
import {openCreditBudget} from './credit-budget.mjs';
import {loadPolicy} from './collection-policy.mjs';
import {atomicJson} from './sync.mjs';
// Only saved transient failures; no directory scan, valid PDP or photo sweep.
export async function repairLights(){
 const snapshot=await readLights();if(!snapshot.source?.complete)throw Error('A complete saved lighting directory is required');
 const selected=snapshot.products.filter(p=>!p.detailsReady&&(p.detailIssue?.transient||p.detailIssue?.deferred));
 const policy={...await loadPolicy(),familyBatchSize:50,familyBatchConcurrency:4},budget=await openCreditBudget(policy),reader=await createFirecrawlBrowserReader({policy,budget});let error,audit;
 try{for(const p of selected)p.detailIssue.retryAfter=null;audit=await updateLightingDetails(snapshot,reader);}
 catch(e){error=e;}
 finally{await reader.close();const native=reader.metrics();await budget.settle({credits:native.firecrawlCredits,receipt:native.receipt,report:{mode:'lighting-transient-evidence-repair',directoryRequests:0,selected:selected.length,native,error:error?.message}});snapshot.repairAudit={directoryRequests:0,selected:selected.length,native,error:error?.message};}
 if(audit)snapshot.detailAudit=audit;await publishLights(snapshot,snapshot.repairAudit.native);
 const report={success:!error&&snapshot.operationalReady,allSourceContentAvailable:snapshot.ready,sourceObservedAtUnchanged:snapshot.observedAt,coverage:snapshot.coverage,...snapshot.repairAudit};await atomicJson('web/lighting-repair-proof.json',report);console.log(JSON.stringify(report));return report;
}
