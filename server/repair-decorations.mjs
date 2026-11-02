import fs from 'node:fs/promises';
import {createFirecrawlBrowserReader} from './firecrawl-browser.mjs';
import {loadPolicy} from './collection-policy.mjs';
import {openCreditBudget} from './credit-budget.mjs';
import {readDecorations,loadDecorationDetails,updateDecorationDetails,enrichDecorations,publishDecorations,publishDecorationStatus,decorationReadiness,restoreDecorationImageEvidence} from './decorations.mjs';
import {selectGalleryImages} from './enrich-appearance.mjs';
import {seedDecorationBaseline} from './update-decorations.mjs';
import {atomicJson} from './sync.mjs';

// Repair saved evidence without another paid catalogue scan or changing its date.
export async function repairDecorations({readerFactory=createFirecrawlBrowserReader,budgetFactory=openCreditBudget}={}){
 const snapshot=await readDecorations();if(!snapshot.source?.complete)throw Error('A complete saved catalogue is required for targeted repair');
 await loadDecorationDetails(snapshot.products);
 const policy={...await loadPolicy(),repairImagesOnly:true,imageBodyBatchSize:250,familyBatchSize:100,familyBatchConcurrency:8,familyFetchTimeoutMs:20000,adaptiveFamilies:true,imageCheckpoint:'web/decoration-image-checkpoint.json'},budget=await budgetFactory(policy);let reader,error,detailAudit;
 try{reader=await readerFactory({policy,budget});detailAudit=await updateDecorationDetails(snapshot,reader);await selectGalleryImages(snapshot.products);const checkpoint=await fs.readFile(policy.imageCheckpoint,'utf8').then(JSON.parse).catch(()=>({entries:{}}));snapshot.browserImageAudit=await reader.auditImages(snapshot.products,{entries:{...snapshot.browserImageAudit?.entries,...checkpoint.entries}},{bodyBatchSize:250});}
 catch(e){error=e;}
 finally{await reader?.close();const native=reader?.metrics()||{};snapshot.repairAudit={sourceRequestsMade:Boolean(native.firecrawlRequests),directoryRequests:0,sourceObservedAtUnchanged:snapshot.observedAt,native,error:error?.message};await budget.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'decoration-evidence-repair',...snapshot.repairAudit}});}
 await restoreDecorationImageEvidence(snapshot);snapshot.detailAudit=detailAudit||snapshot.detailAudit;snapshot.appearanceAudit=await enrichDecorations(snapshot.products);snapshot.appearanceReady=true;decorationReadiness(snapshot);
 if(snapshot.operationalReady&&!snapshot.baselineReady){await seedDecorationBaseline(snapshot);snapshot.baselineReady=true;}
 await publishDecorations(snapshot);await publishDecorationStatus(snapshot,snapshot.repairAudit.native);
 const report={success:!error&&snapshot.operationalReady,allSpecificationsVerified:snapshot.ready,coverage:snapshot.coverage,images:{loaded:snapshot.browserImageAudit.loaded,failed:snapshot.browserImageAudit.failed},...snapshot.repairAudit};await atomicJson('web/decoration-repair-proof.json',report);console.log(JSON.stringify(report));return report;
}
