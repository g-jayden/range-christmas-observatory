// Native media and the supported paid source route were already verified.
// This retained entrypoint only starts the resumable source/image workflow.
import fs from 'node:fs/promises';
await fs.mkdir('runtime/argos-paid-acceptance',{recursive:true});
await fs.writeFile('runtime/argos-paid-acceptance/bootstrap.json',JSON.stringify({state:'resume-exact-source-and-free-native-images',firecrawlCredits:0,sourceWorkflow:'ar.yml'}));
console.log('Resuming only missing Argos exact records; native image verification remains free');
