export function mergeBqFreeVariants(source,rows,recovery,{now=Date.now()}={}){
 if(!source?.complete||source.categories?.length!==10||source.categories.some(c=>!c.complete||!c.closingVerified||c.unique!==c.declared)||recovery?.sourceObservedAt!==source.observedAt||recovery.method!=='ordinary-official-public-HTTP-no-provider'||recovery.firecrawlCredits!==0||recovery.paidRequests!==0||recovery.catalogueDirectoryRequests!==0||!Array.isArray(recovery.records))throw Error('Exact closed B&Q source and free-only recovery evidence required');
 const records=new Map(rows.map(p=>[String(p.id),p])),pending=new Set((source.unresolvedOptions||[]).map(p=>String(p.sku))),seen=new Set,added=[];
 for(const p of recovery.records){const sku=String(p.id),parent=records.get(String(p.parentListedEan)),url=new URL(p.sourceEvidence?.sourceUrl||'https://invalid.invalid');
  if(seen.has(sku)||!pending.has(sku)||sku!==String(p.attributes?.ean)||!parent?.attributes.multiSkus?.some(v=>String(v.ean)===sku)||url.origin!=='https://www.diy.com'||!url.pathname.endsWith('/'+sku+'_BQ.prd')||p.sourceEvidence?.status!==200||p.sourceEvidence?.transport!=='ordinary-official-public-HTTP-no-provider'||!/^[a-f0-9]{64}$/.test(p.sourceEvidence?.responseSha256||'')||Date.parse(p.observedAt)<Date.parse(source.observedAt)||!Number.isFinite(Date.parse(p.observedAt))||Date.parse(p.observedAt)>now)throw Error('B&Q free recovery exact EAN, parent option, source response or time mismatch: '+sku);
  seen.add(sku);if(!records.has(sku)){records.set(sku,p);added.push(sku);}
 }
 const unresolvedOptions=(source.unresolvedOptions||[]).filter(p=>!records.has(String(p.sku)));
 return{source:{...source,unresolvedOptions},records:[...records.values()],added,remaining:unresolvedOptions.length,catalogueDirectoryRequests:0,sourceRequests:0,firecrawlCredits:0};
}
