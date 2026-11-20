import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';
export async function inspectPendingDigest({env=process.env,fetcher=fetch}={}){
 if(env.DIGEST_TEST_OWNER==='true'||env.DIGEST_REPAIR_COMBINED==='true')return{needed:true,mode:'explicit-report-operation',sourceRequests:0,firecrawlCredits:0};
 const base=String(env.CONTROL_API_URL||'').replace(/\/$/,'');if(base!=='https://range-christmas-control.1148522155.workers.dev'||!env.CONTROL_TOKEN)throw Error('Project notification queue is not configured');
 const r=await fetcher(base+'/internal/digest-plan',{method:'POST',headers:{authorization:'Bearer '+env.CONTROL_TOKEN,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Notification queue HTTP '+r.status);const d=await r.json();if(!Array.isArray(d.plans)||!Array.isArray(d.waiting)||d.plans.some(p=>!Array.isArray(p.products)))throw Error('Incomplete notification queue response');
 const products=d.plans.reduce((n,p)=>n+p.products.length,0);return{needed:products>0,products,plans:d.plans.length,waitingSources:d.waiting.length,sourceRequests:0,firecrawlCredits:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await inspectPendingDigest();if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'needed='+result.needed+'\n');console.log(JSON.stringify({phase:'Check unsent PDF queue before full catalogue checkout',...result}));}
