import {dailyDigestPlans} from './daily-digest.mjs';

// Independent trigger for verified unsent contents, even when GitHub completion
// events are delayed. Empty and unverified sources never trigger a report job.
export async function dispatchDigestDue({storage,env,now=Date.now(),fetcher=fetch}){
 const base={sourceRequestsMade:false,firecrawlCredits:0,mailSent:false};
 if(env.DAILY_PDF_DIGEST!=='true'||!env.GITHUB_DISPATCH_TOKEN)return {...base,enabled:false};
 const plans=await dailyDigestPlans(storage,{now,maxPlans:10});if(!plans.plans.length)return {...base,enabled:true,due:false,waitingSources:plans.waiting.length};
 const evidence=plans.plans.map(p=>({id:p.id,products:p.products.map(q=>({key:q.digestProductKey,sourceUrl:q.sourceUrl,detailHash:q.detailEvidence?.sourceContentHash||null,originalHash:q.nativeExportEvidence?.sha256||q.originalImageEvidence?.sha256||q.mailAssets?.original?.sha256||null,cardHash:q.mailAssets?.card?.sha256||null,assetRevision:q.mailAssets?.publishedRevision||null})).sort((a,b)=>a.key.localeCompare(b.key))})).sort((a,b)=>a.id.localeCompare(b.id));
 const key=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(evidence))))].map(b=>b.toString(16).padStart(2,'0')).join('');let claim;
 await storage.transaction(async tx=>{const prior=await tx.get('daily-digest-clock');if(prior?.key===key&&(prior.attempts>=3||now-Date.parse(prior.lastAttemptAt)<20*60000))return;claim={key,day:plans.day,attempts:prior?.key===key?prior.attempts+1:1,lastAttemptAt:new Date(now).toISOString()};await tx.put('daily-digest-clock',claim);});
 if(!claim)return {...base,enabled:true,due:true,bounded:true};
 let status=0;try{const r=await fetcher('https://api.github.com/repos/g-jayden/range-christmas-observatory/actions/workflows/daily-digest.yml/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_DISPATCH_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'range-christmas-scheduler'},body:JSON.stringify({ref:'main',inputs:{testOwner:false}}),signal:AbortSignal.timeout(20000)});status=r.status;}catch{}
 await storage.put('daily-digest-clock',{...claim,lastStatus:status});return {...base,enabled:true,due:true,dispatched:status===204,status,attempts:claim.attempts};
}
