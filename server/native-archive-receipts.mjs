const copy=x=>structuredClone(x),id=r=>r.receipt?.id;
// Restore only receipts owned by the completed archived run. A later checkout
// may contain unrelated source charges, so never replace its aggregate ledger.
export function restoreNativeRunReceipts(current,archive,{runId,authorizationId}={}){
 if(String(runId)!=='44707707847'||authorizationId!=='all-retailers-free-first-native-originals-20261119')throw Error('Unapproved native run receipt restore');
 const out=copy(current);out.restoredNativeReceipts||={};let added=0,credits=0,matched=0;
 for(const[period,p]of Object.entries(archive.periods||{}))for(const r of p.runs||[]){if(r.key!=='native-'+runId+'-1')continue;matched++;
  if(!/^native-session-[a-z0-9-]+$/i.test(id(r)||'')||r.receipt.authorizationId!==authorizationId||!Number.isFinite(r.credits)||r.credits<0||r.credits!==r.receipt.credits||!Number.isFinite(Date.parse(r.completedAt)))throw Error('Invalid archived native receipt');
  const target=out.periods?.[period];if(!target||!Number.isFinite(target.used))throw Error('Current receipt period missing');
  const known=Object.values(out.periods).flatMap(v=>v.runs||[]).find(x=>id(x)===id(r)),mark=out.restoredNativeReceipts[id(r)];if(known&&known.credits!==r.credits||mark&&(mark.credits!==r.credits||mark.period!==period))throw Error('Conflicting archived native receipt amount');
  if(!known&&!mark){target.used+=r.credits;target.runs=[...(target.runs||[]),copy(r)].sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt))).slice(-80);added++;credits+=r.credits;}
  const scoped={receiptId:id(r),credits:r.credits,authorizationId,scope:'failed-native-originals-all-retailers'},prior=target.uncappedReceipts?.[id(r)];if(prior&&JSON.stringify(prior)!==JSON.stringify(scoped))throw Error('Conflicting archived native scope');target.uncappedReceipts||={};target.uncappedReceipts[id(r)]=scoped;
  out.restoredNativeReceipts[id(r)]={period,credits:r.credits,runId:String(runId)};
  if(Date.parse(r.completedAt)>Date.parse(out.nativeImageFallback?.completedAt||'1970-01-01'))out.nativeImageFallback={...copy(r.receipt),monthlyLimit:null,sourceCatalogueRequests:0};
 }
 if(!matched)throw Error('Archive has no verified receipts for its own native run');
 return{ledger:out,added,credits};
}
export function restoreNativeIndexEntries(current,archive){
 const out=copy(current);out.entries||={};for(const[url,y]of Object.entries(archive.entries||{})){
  if(y.url!==url||y.ok!==true||y.sourceBytesUnchanged!==true||!/^[a-f0-9]{64}$/.test(y.hash||'')||!y.cachedImageUrl?.includes(y.hash+'.')||!(y.width>=64&&y.height>=64)||!Array.isArray(y.bindings)||!y.bindings.length)throw Error('Invalid archived exact native binding');
  const x=out.entries[url];if(!x){out.entries[url]=copy(y);continue;}
  if(x.hash!==y.hash||x.cachedImageUrl!==y.cachedImageUrl||x.width!==y.width||x.height!==y.height||x.bytes!==y.bytes)throw Error('Conflicting native source bytes: '+url);
  const newer=Date.parse(y.observedAt||0)>Date.parse(x.observedAt||0)?y:x;out.entries[url]={...copy(newer),bindings:[...new Set([...(x.bindings||[]),...y.bindings])].sort(),selectedSkus:[...new Set([...(x.selectedSkus||[]),...(y.selectedSkus||[])])].sort()};
 }
 if(Date.parse(archive.lastReceipt?.completedAt||'1970-01-01')>Date.parse(out.lastReceipt?.completedAt||'1970-01-01'))out.lastReceipt=copy(archive.lastReceipt);return out;
}
