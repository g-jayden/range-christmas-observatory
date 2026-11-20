import fs from 'node:fs/promises';
import {nativeContinuation} from '../server/native-continuation.mjs';
import {loadUncappedCreditGrants} from '../server/credit-scope.mjs';
const env=process.env,deferred=await fs.readFile('runtime/native-archive-deferred.json','utf8').then(JSON.parse).catch(()=>null);if(env.GITHUB_REPOSITORY==='g-jayden/range-christmas-observatory'&&deferred?.runId===env.GITHUB_RUN_ID&&deferred.archiveRun===44707707847){console.log(JSON.stringify({phase:'Native continuation waits for saved archive restoration',sourceRequests:0,firecrawlCredits:0}));process.exit(0);}
const status=JSON.parse(await fs.readFile('web/native-original-recovery-status.json','utf8'));
if(env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!env.GITHUB_TOKEN||status.runId!==env.GITHUB_RUN_ID||status.runAttempt!==env.GITHUB_RUN_ATTEMPT)throw Error('Only the exact saved native recovery run can continue');
const depth=Number(env.NATIVE_CONTINUATION_DEPTH||0),policy=JSON.parse(await fs.readFile('web/collection-policy.json','utf8')),grant=(await loadUncappedCreditGrants()).some(g=>g.scope==='failed-native-originals-all-retailers');
if(!grant)throw Error('The all-retailer native-image grant must still be active');
const decision=nativeContinuation({remaining:status.pending.length,verifiedThisRun:status.recovered},{depth,used:0,reserved:0,monthLimit:policy.maxCreditsPerCalendarMonth,authorizedUnlimitedNative:grant});
if(!decision.continue){console.log(JSON.stringify({phase:'Native continuation stopped',reason:decision.reason,pending:status.pending.length,issues:status.issues.length,progress:status.recovered,depth,sourceRequests:0,firecrawlCredits:0}));process.exit(0);}
const r=await fetch('https://api.github.com/repos/'+env.GITHUB_REPOSITORY+'/actions/workflows/native-images.yml/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','content-type':'application/json'},body:JSON.stringify({ref:'main',inputs:{continuationDepth:String(decision.depth)}}),signal:AbortSignal.timeout(20000)});
if(r.status!==204)throw Error('Native continuation dispatch HTTP '+r.status);
console.log(JSON.stringify({phase:'Continue remaining exact originals after durable publication',pending:status.pending.length,depth:decision.depth,maximumDepth:decision.maximumDepth,sourceDirectoriesRequested:0,firecrawlCredits:0}));
