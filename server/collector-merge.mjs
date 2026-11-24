const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=x=>x===undefined?undefined:structuredClone(x);
function mergeValue(base,a,b,label){
 if(same(a,b)||same(b,base))return clone(a);if(same(a,base))return clone(b);
 if(a&&b&&!Array.isArray(a)&&!Array.isArray(b)&&typeof a==='object'&&typeof b==='object')return Object.fromEntries([...new Set([...Object.keys(base||{}),...Object.keys(a),...Object.keys(b)])].map(k=>[k,mergeValue(base?.[k],a[k],b[k],label+'.'+k)]).filter(([,v])=>v!==undefined));
 throw Error('Conflicting collector evidence: '+label);
}
const receiptKey=r=>r.receipt?.id||r.key;
const newestReceipt=(...values)=>clone(values.filter(Boolean).sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||''))||String(b.id||'').localeCompare(String(a.id||'')))[0]);
export function mergeCollectorPreviewStatus(base={},a={},b={}){
 const keys=new Set(['version','revision','checkedAt','products','registered','changed','limited','pending','sourceRequestsMade','batches','fetched','failed','categoryOrArrivalHistoryChanged']);
 const valid=s=>s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>keys.has(k))&&typeof s.version==='string'&&Number.isFinite(Date.parse(s.checkedAt))&&['products','registered','changed','limited','pending','batches','fetched','failed'].every(k=>s[k]===undefined||Number.isSafeInteger(s[k])&&s[k]>=0);
 if(!valid(a)||!valid(b))throw Error('Only checked preview summary metadata may be reconciled');
 if(same(a,b)||same(b,base))return clone(a);if(same(a,base))return clone(b);
 const left=Date.parse(a.checkedAt),right=Date.parse(b.checkedAt);if(left===right)throw Error('Ambiguous concurrent preview summaries');
 return clone(left>right?a:b);
}
export function mergeCollectorLedgers(base={},a={},b={}){
 const periods={},ids=new Set([...Object.keys(base.periods||{}),...Object.keys(a.periods||{}),...Object.keys(b.periods||{})]);
 for(const id of ids){
  const prior=base.periods?.[id]||{used:0,runs:[],reservations:{}},left=a.periods?.[id]||prior,right=b.periods?.[id]||prior;
  const original=new Set((prior.runs||[]).map(receiptKey)),l=new Map((left.runs||[]).map(r=>[receiptKey(r),r])),r=new Map((right.runs||[]).map(r=>[receiptKey(r),r]));let overlap=0;
  for(const [key,x]of l)if(r.has(key)&&!original.has(key)){if(x.credits!==r.get(key).credits)throw Error('Conflicting billing receipt amount');overlap+=x.credits;}
  for(const [key,x]of Object.entries(a.externalReceipts||{}))if(!base.externalReceipts?.[key]&&b.externalReceipts?.[key]&&x.period===id){if(!same(x,b.externalReceipts[key]))throw Error('Conflicting external receipt');overlap+=x.credits-x.refunded;}
  const used=left.used+right.used-prior.used-overlap;if(!Number.isFinite(used)||used<0)throw Error('Invalid merged billing total');
  const fields=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['used','runs','reservations'].includes(k)));
  periods[id]={...mergeValue(fields(prior),fields(left),fields(right),'period.'+id),used,reservations:mergeValue(prior.reservations||{},left.reservations||{},right.reservations||{},'reservations'),runs:[...new Map([...(left.runs||[]),...(right.runs||[])].map(x=>[receiptKey(x),x])).values()].sort((x,y)=>String(x.completedAt||'').localeCompare(String(y.completedAt||''))).slice(-80)};
 }
 const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['periods','lastRun','nativeImageFallback'].includes(k)));
 const lastRun=[a.lastRun,b.lastRun].filter(Boolean).sort((x,y)=>Date.parse(y.completedAt||0)-Date.parse(x.completedAt||0))[0];
 const nativeImageFallback=newestReceipt(a.nativeImageFallback,b.nativeImageFallback);
 return {...mergeValue(strip(base),strip(a),strip(b),'ledger'),periods,...(lastRun?{lastRun}: {}),...(nativeImageFallback?{nativeImageFallback}: {})};
}
// Multiple exact-SKU consumers can preserve the same unchanged original. A
// concurrent receipt must add bindings, never erase the other consumer's image.
export function mergeCollectorNativeIndexes(base={},a={},b={}){
 const entries={};for(const source of new Set([...Object.keys(a.entries||{}),...Object.keys(b.entries||{})])){
  const prior=base.entries?.[source],x=a.entries?.[source],y=b.entries?.[source];
  if(!x||!y||same(x,y)||same(y,prior)){entries[source]=clone(x||y);continue;}
  if(same(x,prior)){entries[source]=clone(y);continue;}
  if(x.url!==source||y.url!==source||x.ok!==true||y.ok!==true||!x.hash||x.hash!==y.hash||x.cachedImageUrl!==y.cachedImageUrl||x.width!==y.width||x.height!==y.height||x.bytes!==y.bytes)throw Error('Conflicting exact native image evidence: '+source);
  const latest=Date.parse(y.observedAt||0)>Date.parse(x.observedAt||0)?y:x;
  entries[source]={...clone(latest),bindings:[...new Set([...(x.bindings||[]),...(y.bindings||[])])].sort(),selectedSkus:[...new Set([...(x.selectedSkus||[]),...(y.selectedSkus||[])])].sort()};
 }
 const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['entries','lastReceipt','checkedAt'].includes(k))),lastReceipt=newestReceipt(a.lastReceipt,b.lastReceipt),checks=[a.checkedAt,b.checkedAt].filter(v=>v!==undefined);
 if(checks.some(v=>!Number.isFinite(Date.parse(v))))throw Error('Invalid native index observation time');
 return {...mergeValue(strip(base),strip(a),strip(b),'native-index'),entries,...(checks.length?{checkedAt:new Date(Math.max(...checks.map(Date.parse))).toISOString()}:{}),...(lastReceipt?{lastReceipt}: {})};
}
export function mergeCollectorImageCaches(base={},a={},b={}){
 const entries={};for(const key of new Set([...Object.keys(a.entries||{}),...Object.keys(b.entries||{})])){
  const x=a.entries?.[key],y=b.entries?.[key];if(!x||!y||same(x,y)){entries[key]=clone(x||y);continue;}
  if((x.imageHash&&x.imageHash!==key)||(y.imageHash&&y.imageHash!==key))throw Error('Shared image-cache identity changed');
  entries[key]=clone(Date.parse(y.checkedAt||y.observedAt||0)>Date.parse(x.checkedAt||x.observedAt||0)?y:x);
 }
 const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='entries'));return{...mergeValue(strip(base),strip(a),strip(b),'image-cache'),entries};
}
