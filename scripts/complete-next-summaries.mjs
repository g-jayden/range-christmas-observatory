import fs from 'node:fs/promises';
const source=JSON.parse(await fs.readFile('runtime/next-full-directory.json','utf8'));
if(source.categories.length!==5||source.categories.some(c=>c.rows.length!==c.declared||new Set(c.rows.map(r=>r.itemNumber)).size!==c.declared))throw Error('Complete five-category directory checkpoint required');
const entries=new Map(source.categories.flatMap(c=>c.rows).map(r=>[r.itemNumber,r])),covered=new Set(),families=(source.summaries||[]).filter(s=>s.kind==='official-summary'&&s.data);
for(const s of families)for(const c of s.data.colourways||[])covered.add(c.itemNumber);
let requests=0;const failures=[];
while([...entries.keys()].some(id=>!covered.has(id))){const batch=[...entries.values()].filter(r=>!covered.has(r.itemNumber)).slice(0,10),u=new URL('https://api.nextdirect.com/api/edge-aggregator/product-summary/v1/index.json');u.search=new URLSearchParams({realm:'next',territory:'GB',language:'en',productIds:batch.map(r=>r.itemNumber+'|'+r.type).join(',')});requests++;
 try{const r=await fetch(u,{signal:AbortSignal.timeout(25000)});if(r.status!==200)throw Error('Next official summary HTTP '+r.status);const d=await r.json(),received=[];
  for(const item of d.items||[]){const p=item.productData?.data?.productSummary;if(!p?.itemNumber||!p.colourways?.length)throw Error('Next official family summary missing');families.push({kind:'official-summary',data:p});received.push(p.itemNumber);for(const c of p.colourways)covered.add(c.itemNumber);covered.add(p.itemNumber);}
  if(batch.some(r=>!covered.has(r.itemNumber)))throw Error('Next official summary batch omits requested item');
  source.summaries=families;source.summaryCoverage={expected:entries.size,covered:[...entries.keys()].filter(id=>covered.has(id)).length,requests,firecrawlCredits:0};await fs.writeFile('runtime/next-full-directory.json',JSON.stringify(source));console.log(JSON.stringify(source.summaryCoverage));
 }catch(e){failures.push({items:batch.map(r=>r.itemNumber),error:e.message});break;}
}
source.directoryComplete=true;source.summaryComplete=!failures.length&&[...entries.keys()].every(id=>covered.has(id));source.complete=source.directoryComplete&&source.summaryComplete;source.sourceAttempts=[...(source.sourceAttempts||[]),...(source.failures||[])];source.failures=failures;
await fs.mkdir('web/nx',{recursive:true});await fs.writeFile('web/nx/source-directory.json',JSON.stringify(source));await fs.writeFile('runtime/next-full-directory.json',JSON.stringify(source));console.log(JSON.stringify({complete:source.complete,summaryCoverage:source.summaryCoverage,failures,requests,firecrawlCredits:0}));if(!source.complete)process.exitCode=1;
