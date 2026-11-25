import{springNotificationPayload}from'../server/spring-notification-payload.mjs';
import{springMonitoringPayload}from'../server/spring-monitoring-payload.mjs';
import{publishedEvidenceRevision}from'../server/isolated-evidence-publication.mjs';
import fs from'node:fs/promises';import{control}from'../server/cloud-client.mjs';import{atomicJson}from'../server/sync.mjs';
const readyOutput=async value=>{if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'ready='+value+'\n');};
const status=JSON.parse(await fs.readFile('web/spring/status.json','utf8'));let inputs;
try{const[source,catalogue,review]=await Promise.all(['source.json','candidate-catalogue.json','review.json'].map(file=>fs.readFile('web/spring/'+file,'utf8').then(JSON.parse)));inputs={source,catalogue,review,status};}catch(e){if(e.code!=='ENOENT')throw e;}
if(!status.ready&&!inputs){await readyOutput(false);console.log(JSON.stringify({phase:'spring-verification-pending',products:status.products,reviewPending:status.reviewPending,activated:false,mailSent:false}));process.exit(0);}
const catalogue=inputs?.catalogue||JSON.parse(await fs.readFile('web/spring/catalogue.json','utf8'));if(catalogue.observedAt!==status.observedAt)throw Error('Mixed Spring source observations');
const committedRevision=publishedEvidenceRevision();if(!/^[a-f0-9]{40}$/.test(committedRevision))throw Error('Committed spring evidence revision required');
const payload=inputs?springMonitoringPayload(inputs,committedRevision):springNotificationPayload(catalogue,committedRevision),result=await control('/internal/spring-sync',payload);
if(result.ignored){await readyOutput(false);console.log(JSON.stringify({phase:'spring-newer-source-preserved',...result,mailSent:false}));process.exit(0);}
if(!result.baselineReady||result.products!==catalogue.products.length||result.sourceFresh!==false&&!result.ownerSubscriptionConfigured)throw Error('Spring inventory or confirmed owner NEW subscription was not accepted completely');
for(const file of ['web/spring/source.json',...(inputs?['web/spring/candidate-catalogue.json']:[])]){const d=JSON.parse(await fs.readFile(file,'utf8'));d.baselineReady=true;d.syncedObservedAt=d.observedAt;d.arrivalMonitoringContract=payload.contract;await atomicJson(file,d);}
await atomicJson('web/spring/catalogue.json',{...catalogue,baselineReady:true,syncedObservedAt:catalogue.observedAt,automaticArrivalChecks:true,arrivalMonitoringContract:payload.contract});
await atomicJson('web/spring/status.json',{...status,baselineReady:true,automaticArrivalChecks:true,arrivalMonitoringContract:payload.contract,ownerSubscriptionConfigured:result.ownerSubscriptionConfigured,evidencePending:result.evidencePending||0});
await readyOutput(true);console.log(JSON.stringify({phase:'spring-confirmed-inventory-and-unified-pdf-queue',...result,reviewComplete:catalogue.ready,mailSent:false}));
