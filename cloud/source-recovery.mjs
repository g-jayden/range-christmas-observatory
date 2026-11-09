export const sourceDay=now=>new Date(Number(now)+8*3600000).toISOString().slice(0,10);
export function sourceRetryDue(m,now=Date.now()){
 return m?.sourceRetryDay===sourceDay(now)&&m.sourceAttempts<3&&Number.isFinite(Date.parse(m.sourceRetryAt))&&now>=Date.parse(m.sourceRetryAt);
}
export function sourceRecovery(previous,{success,retryable=false,now=Date.now()}){
 const day=sourceDay(now),attempts=(previous.sourceRetryDay===day?previous.sourceAttempts||0:0)+1;
 if(success)return {sourceRetryDay:day,sourceAttempts:0,sourceRetryAt:null,sourceRetryExhausted:false};
 const at=now+(attempts===1?15:45)*60000,allowed=retryable&&attempts<3&&sourceDay(at)===day;
 return {sourceRetryDay:day,sourceAttempts:attempts,sourceRetryAt:allowed?new Date(at).toISOString():null,sourceRetryExhausted:retryable&&!allowed};
}
export function retryableSourceError(e){
 if(e?.budgetLimited||[400,401,402,404,422].includes(e?.status))return false;
 if(e?.retryable||e?.sourceTransportUnavailable||[0,403,408,429,500,502,503,504].includes(e?.status))return true;
 return /ERR_QUIC|network|fetch failed|ECONN|ETIMEDOUT|timeout|timed out|连接|传输|request unavailable|proxy error/i.test(String(e?.message||''));
}
