const IDS={decorations:'94578',lights:'94579',themes:'94583'};
// Only resume an unfinished full-refresh cycle. The daily NEW path always
// reads a fresh directory. Reused snapshots keep their real observation time.
export function reusableFullDirectory(snapshot,{kind,cycle,due,now=Date.now(),maxAgeMs=3600000}={}){
 if(!cycle?.pending||Date.parse(cycle.due)!==Date.parse(due)||!IDS[kind]||snapshot?.baselineReady!==true||!Array.isArray(snapshot.products))return false;
 const at=Date.parse(snapshot.observedAt),day=t=>new Date(t+28800000).toISOString().slice(0,10);
 if(!Number.isFinite(at)||at>now||now-at>Math.min(maxAgeMs,3600000)||day(at)!==day(now)||at<Date.parse(cycle.cutoff))return false;
 const source=snapshot.source,rows=snapshot.products,keys=rows.map(p=>String(p.sku));
 if(String(source?.id)!==IDS[kind]||source.complete!==true||source.expected!==rows.length||source.unique!==rows.length||new Set(keys).size!==rows.length)return false;
 if(rows.some(p=>!p.sku||!Number.isFinite(p.priceGBP)||p.priceGBP<0||p.observedAt!==snapshot.observedAt))return false;
 const audits=Object.keys(snapshot.sources||{}).length?Object.values(snapshot.sources):[source];
 if(audits.some(a=>a.complete!==true||a.expected!==a.observed||a.expected!==a.unique))return false;
 return audits.every(a=>a.batches?.length&&a.batches.every(b=>{try{const u=new URL(b.url),f=JSON.parse(u.searchParams.get('filters')||'{}');return u.origin==='https://search-lon.therange.co.uk'&&u.pathname==='/api/productlist'&&f.in_stock_f?.includes('true');}catch{return false;}}));
}
export function resumeFullDirectory(snapshot,options){return reusableFullDirectory(snapshot,options)?structuredClone(snapshot):null;}
