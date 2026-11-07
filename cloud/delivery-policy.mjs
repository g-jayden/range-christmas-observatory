// Retry delivery only. Never reopen the retailer or spend source credits here.
export const MAX_DELIVERY_ATTEMPTS=3;
const BACKOFF_MS=[60000,5*60000];
export function payloadIdentity(p,configurationRevision=''){
 const m=p.mailAssets||{};
 return JSON.stringify([p.sku,p.sourceUrl,p.priceGBP,p.variantName,m.cardVersion,m.card?.url,m.card?.sha256,m.original?.url,m.original?.sha256,m.mailOriginal?.url,m.mailOriginal?.sha256,m.proof?.url,m.proof?.sha256,configurationRevision]);
}
export function retryState(record,fingerprint,now=Date.now()){
 if(!record||record.fingerprint!==fingerprint)return 'ready';
 if(record.blocked)return 'blocked';
 return Number(record.nextAttemptAt||0)<=now?'ready':'waiting';
}
export function deliveryFailure(previous,fingerprint,error,now=Date.now()){
 const attempts=previous?.fingerprint===fingerprint?previous.attempts+1:1;
 const status=Number(error.providerStatus||0),code=String(error.providerCode||'').slice(0,80);
 const permanent=status>=400&&status<500&&![408,425,429].includes(status);
 const blocked=permanent||attempts>=MAX_DELIVERY_ATTEMPTS;
 return {fingerprint,attempts,blocked,reason:permanent?'provider-rejected-payload-or-configuration':blocked?'retry-limit-reached':'temporary-delivery-failure',providerStatus:status||null,providerCode:code||null,assetStatus:Number(error.assetStatus||0)||null,failedAt:new Date(now).toISOString(),nextAttemptAt:blocked?null:now+BACKOFF_MS[Math.min(attempts-1,BACKOFF_MS.length-1)]};
}
// Older deployed controls do not yet expose readyDeliveries. Keep compatibility
// during deployment; new controls suppress retries of unchanged blocked items.
export function hasReadyDeliveries(monitor){
 return Number(monitor?.readyDeliveries??monitor?.pendingDeliveries??0)>0;
}
