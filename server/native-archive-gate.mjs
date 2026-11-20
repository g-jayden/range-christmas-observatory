export async function savedNativeArchivePending(ledger,{token,fetcher=fetch}={}){
 if(Object.values(ledger.restoredNativeReceipts||{}).some(r=>r.runId==='44707707847'))return false;
 if(!token)throw Error('Saved native archive state requires the owner workflow identity');
 const r=await fetcher('https://api.github.com/repos/g-jayden/range-christmas-observatory/actions/artifacts/14620947782',{headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});if(r.status===404)return false;if(!r.ok)throw Error('Saved native archive status HTTP '+r.status);const a=await r.json();return a.expired!==true&&a.name==='native-original-evidence-44707707847-1'&&a.workflow_run?.id===44707707847&&a.workflow_run.head_repository_id===1439271815&&a.digest==='sha256:c9536f77127c547b734a3ba792479c6372e208e2b971762a81e02004fb45ce5c';
}
