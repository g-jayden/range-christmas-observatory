import fs from 'node:fs/promises';
import {atomicJson} from '../server/sync.mjs';
import {recordSourceOutcome} from '../server/source-health.mjs';
import {loadPolicy} from '../server/collection-policy.mjs';
import {reserveCredits} from '../server/credit-budget.mjs';
try{
const key=process.env.FIRECRAWL_API_KEY;if(!key)throw Error('FIRECRAWL_API_KEY is not configured');
const response=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)});
const body=await response.json();if(!response.ok||body.success===false||!Number.isFinite(body.data?.remainingCredits))throw Error('Firecrawl credit balance could not be verified: HTTP '+response.status);
const policy=await loadPolicy(),reservation=await reserveCredits(policy,{accountRemaining:body.data.remainingCredits});
console.log(JSON.stringify({reserved:reservation.limit,projectMonthlyLimit:policy.maxCreditsPerCalendarMonth,accountReserveProtected:true}));

}catch(error){
 const status=await fs.readFile('web/status.json','utf8').then(JSON.parse).catch(()=>({}));
 status.running=false;status.mode='firecrawl-browser';status.provider='firecrawl-browser';status.lastError={message:error.message,phase:'credit-reservation',at:new Date().toISOString()};
 status.sourceHealth=recordSourceOutcome(status.sourceHealth,{success:false,engine:'firecrawl-browser',message:error.message});
 await atomicJson('web/status.json',status);console.error(error.message);process.exitCode=1;
}
