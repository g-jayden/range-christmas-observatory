// A narrowly scoped repair may use saved current directories but may never
// silently fall back to another catalogue scan or introduce a different EAN.
export function bqVariantResume(request,{closed,records,now=Date.now()}={}) {
 if(request?.state!=='pending')return null;
 const day=new Date(now+28800000).toISOString().slice(0,10),epoch=Date.parse(closed?.observedAt);
 if(request.scope!=='missing-exact-variant-options-only'||request.catalogueDirectoryRequestsAllowed!==false||!Array.isArray(request.skus)||request.skus.some(s=>!/^\d{8,14}$/.test(s))||new Set(request.skus).size!==request.skus.length)throw Error('Invalid B&Q missing-variant repair scope');
 if(!closed?.complete||closed.observedAt!==request.sourceObservedAt||!Number.isFinite(epoch)||epoch<Date.parse(day+'T06:00:00+08:00')||epoch>now||closed.categories?.length!==10||closed.categories.some(c=>!c.complete||!c.closingVerified||c.unique!==c.declared||c.products?.length!==c.unique||c.products.some(p=>!records.has(String(p.id)))))throw Error('B&Q variant-only repair requires the exact current closed source; directory recollection is forbidden');
 return new Set(request.skus);
}
export function assertBqVariantJobs(allowed,jobs){if(allowed&&jobs.some(([sku])=>!allowed.has(String(sku))))throw Error('B&Q variant-only repair encountered an EAN outside the approved missing list');}
