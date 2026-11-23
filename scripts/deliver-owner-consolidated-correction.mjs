import fs from 'node:fs/promises';
import {control} from '../server/cloud-client.mjs';
const request=JSON.parse(await fs.readFile('ops/digest-correction-request.json','utf8')),proof=request.reviewedPublication;
if(proof?.visuallyReviewed!==true||!/^[a-f0-9]{64}$/.test(proof.planId||'')||!/^[a-f0-9]{40}$/.test(proof.revision||'')||!/^[a-f0-9]{64}$/.test(proof.pdfSha256||''))throw Error('A pinned, visually reviewed consolidated PDF is required before sending');
const url='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/'+proof.revision+'/web/reports/'+proof.planId+'/manifest.json',r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Reviewed report HTTP '+r.status);const m=await r.json();
if(!m.correction||m.day!==request.day||m.planId!==proof.planId||m.pdf.sha256!==proof.pdfSha256||JSON.stringify([...m.originalReports].sort())!==JSON.stringify([...request.parentIds].sort()))throw Error('Reviewed report does not match the approved combined correction');
const receipt=await control('/internal/digest-ready',{id:proof.planId,revision:proof.revision});if(!receipt.accepted)throw Error('Mail provider has not accepted the consolidated correction');console.log(JSON.stringify({phase:'Deliver one reviewed owner consolidated correction',...receipt,sourceRequests:0,firecrawlCredits:0}));
