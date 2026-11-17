export function nxImageFresh(prior,observedAt,{maxAgeDays=7,now=Date.now()}={}){
 const checked=Date.parse(prior?.checkedAt||prior?.observedAt),source=Date.parse(observedAt);
 return Boolean(prior?.file&&!prior.error&&!(prior.status>=400)&&Number.isFinite(checked)&&Number.isFinite(source)&&checked>=source&&checked<=now&&now-checked<maxAgeDays*86400000);
}

export const nextReviewMatches=(review,fingerprint,hash)=>review?.sourceFingerprint===fingerprint&&(review.imageHash===hash||review.reviewedImageHashes?.includes(hash));
export function nextReviewedPreview(pool,review,fingerprint){
 if(!review||review.sourceFingerprint!==fingerprint)return null;
 return pool.find(p=>p.url===review.previewSourceUrl&&p.hash===review.previewImageHash)||pool.find(p=>p.hash===review.imageHash)||pool.find(p=>review.reviewedImageHashes?.includes(p.hash))||null;
}
// Retry transient transport failures on the exact original only. A 403/404 is
// returned immediately; it must never trigger a complete paid source re-scan.
export async function requestNextOriginal(url,{method='GET',headers={},fetcher=fetch,maxAttempts=3,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const u=new URL(url);if(u.origin!=='https://xcdn.next.co.uk'||!u.pathname.startsWith('/common/items/'))throw Error('Unexpected Next original URL');
 for(let attempt=0;attempt<maxAttempts;attempt++){
  try{const r=await fetcher(url,{method,headers,signal:AbortSignal.timeout(40000)});if(r.status<500&&r.status!==429||attempt===maxAttempts-1)return r;const delay=Number(r.headers.get('retry-after')||0);if(delay>15)return r;await wait(delay>0?delay*1000:500*(attempt+1));}
  catch(e){if(attempt===maxAttempts-1)throw e;await wait(500*(attempt+1));}
 }
}
