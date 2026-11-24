import fs from 'node:fs/promises';
import {readSpring} from './update-spring.mjs';
import {loadPolicy} from './collection-policy.mjs';
import {openCreditBudget} from './credit-budget.mjs';
import {createFirecrawlBrowserReader} from './firecrawl-browser.mjs';
import {planSpringNativeBodies} from './spring-native-body-plan.mjs';
import {atomicJson} from './sync.mjs';
const read=async(f,d)=>fs.readFile(f,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return d;throw e;});
const source=await readSpring(),request=await read('web/spring-repair/native-body-request.json',{}),file='web/spring-repair/native-body-result.json',previous=await read(file,{}),plan=planSpringNativeBodies(source,request,previous);
if(plan.reused){console.log(JSON.stringify({phase:'spring-native-body-request-already-executed',requestId:request.requestId,sourceRequests:0,firecrawlCredits:0}));}
else{
 const checkpoint='web/spring/image-checkpoint.json',policy={...await loadPolicy(),repairImagesOnly:true,preferNativePreviewAssets:true,imageBatchProbe:false,imageCheckpoint:checkpoint,maxRunSeconds:3600};
 const result={requestId:request.requestId,baseObservedAt:source.observedAt,startedAt:new Date().toISOString(),requested:plan.requested,sourceDirectoriesRequested:0,productFactsUpdated:0,selectedPhotosUpdated:0,mailSent:false};
 // Persist the one-shot claim before any network operation. A crashed job can
 // preserve its native checkpoint; rerunning this nonce never spends again.
 await atomicJson(file,result);let reader,budget;
 try{budget=await openCreditBudget(policy);reader=await createFirecrawlBrowserReader({policy,budget});const before=await read(checkpoint,{entries:{}});result.audit=await reader.auditImages(plan.products,{entries:{...source.imageAudit?.entries,...before.entries}},{bodyBatchSize:40});await atomicJson(checkpoint,{...before,entries:{...before.entries,...result.audit.entries},observedAt:new Date().toISOString()});}
 catch(e){result.error=String(e.message).slice(0,250);}
 finally{await reader?.close();const native=reader?.metrics()||{};await budget?.settle({credits:native.firecrawlCredits||0,receipt:native.receipt,report:{mode:'exact-spring-missing-native-bodies-only',requestId:request.requestId,native,error:result.error}});result.native=native;
  const saved=await read(checkpoint,{entries:{}});result.loaded=plan.products.filter(p=>saved.entries?.[p.variantImageUrl]?.ok).length;result.missing=plan.products.filter(p=>!saved.entries?.[p.variantImageUrl]?.ok).map(p=>({sku:p.sku,url:p.variantImageUrl}));result.completedAt=new Date().toISOString();await atomicJson(file,result);console.log(JSON.stringify({phase:'spring-native-body-result',requestId:result.requestId,requested:result.requested,loaded:result.loaded,missing:result.missing.length,firecrawlCredits:native.firecrawlCredits||0,sourceDirectoriesRequested:0,productFactsUpdated:0,error:result.error}));}
}
