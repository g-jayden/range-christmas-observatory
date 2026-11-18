// The supported route and complete source membership have been established.
// This legacy diagnostic workflow is now a source-free bootstrap for the
// resumable exact-record collector; it must not repeat earlier paid probes.
import fs from 'node:fs/promises';
await fs.mkdir('runtime/argos-paid-acceptance',{recursive:true});
await fs.writeFile('runtime/argos-paid-acceptance/bootstrap.json',JSON.stringify({state:'supported-route-established',firecrawlCredits:0,sourceWorkflow:'ar.yml'}));
console.log('Supported Argos route established; requesting the resumable source workflow without another diagnostic scrape');
