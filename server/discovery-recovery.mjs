import {categories} from './sync.mjs';
const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
// Resume only the unfinished evidence/mail stage of an already completed
// discovery. Never refresh its timestamps or substitute yesterday's directory.
export function canResumeDiscovery({proof,snapshots,now=Date.now()}){
 if(proof?.success!==false||!['daily-new-only','pending-NEW-recovery'].includes(proof.mode))return false;
 // Legacy daily runs could read families only after all enabled directories
 // were collected and saved. New runs record that boundary explicitly.
 if(proof.catalogueReady!==true&&!(proof.mode==='daily-new-only'&&proof.native?.familyReads>0&&proof.native?.catalogueRequests>0))return false;
 const failedAt=Date.parse(proof.completedAt||proof.observedAt);if(!Number.isFinite(failedAt)||now<failedAt||now-failedAt>6*3600000)return false;
 const enabled=Object.entries(snapshots).filter(([kind,s])=>kind==='catalogue'||s?.baselineReady);
 if(!enabled.length)return false;
 for(const [kind,s]of enabled){
  if(!Array.isArray(s?.products))return false;
  const observed=Date.parse(s?.observedAt);if(!Number.isFinite(observed)||observed>failedAt||now-observed>6*3600000||day(observed)!==day(now))return false;
  if(kind==='catalogue'){
   if(Object.keys(s.sources||{}).length!==7||Object.keys(categories).some(k=>!s.sources[k])||Object.values(s.sources).some(a=>a.complete!==true||!Number.isInteger(a.expected)||a.unique!==a.expected))return false;
  }else if(s.source?.complete!==true||!Number.isInteger(s.source.expected)||s.products?.length!==s.source.expected)return false;
 }
 return true;
}
