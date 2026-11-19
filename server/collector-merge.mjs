const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=x=>x===undefined?undefined:structuredClone(x);
function mergeValue(base,a,b,label){
 if(same(a,b)||same(b,base))return clone(a);if(same(a,base))return clone(b);
 if(a&&b&&!Array.isArray(a)&&!Array.isArray(b)&&typeof a==='object'&&typeof b==='object')return Object.fromEntries([...new Set([...Object.keys(base||{}),...Object.keys(a),...Object.keys(b)])].map(k=>[k,mergeValue(base?.[k],a[k],b[k],label+'.'+k)]).filter(([,v])=>v!==undefined));
 throw Error('Conflicting collector evidence: '+label);
}
const receiptKey=r=>r.receipt?.id||r.key;
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
 const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['periods','lastRun'].includes(k)));
 const lastRun=[a.lastRun,b.lastRun].filter(Boolean).sort((x,y)=>Date.parse(y.completedAt||0)-Date.parse(x.completedAt||0))[0];
 return {...mergeValue(strip(base),strip(a),strip(b),'ledger'),periods,...(lastRun?{lastRun}: {})};
}
export function mergeCollectorImageCaches(base={},a={},b={}){
 const entries={};for(const key of new Set([...Object.keys(a.entries||{}),...Object.keys(b.entries||{})])){
  const x=a.entries?.[key],y=b.entries?.[key];if(!x||!y||same(x,y)){entries[key]=clone(x||y);continue;}
  if((x.imageHash&&x.imageHash!==key)||(y.imageHash&&y.imageHash!==key))throw Error('Shared image-cache identity changed');
  entries[key]=clone(Date.parse(y.checkedAt||y.observedAt||0)>Date.parse(x.checkedAt||x.observedAt||0)?y:x);
 }
 const strip=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='entries'));return{...mergeValue(strip(base),strip(a),strip(b),'image-cache'),entries};
}
