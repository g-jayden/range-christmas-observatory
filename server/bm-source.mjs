// Run only inside the real B&M page. Its public search service requires the
// actual browser origin; no Referer/Origin header is forged by this client.
export async function readBmDirectoryInsideSite(){
 if(location.origin!=='https://www.bmstores.co.uk')throw Error('B&M browser origin required');
 const config=JSON.parse(document.querySelector('[data-config="algolia"]').textContent);
 if(!/^[A-Z0-9]+$/.test(config.appId)||!/^prod_bmstores$/.test(config.index))throw Error('Unexpected B&M public search configuration');
 const fields=["objectID", "productcode", "productcodebm", "title", "url", "longdescription", "teaser", "productstockstatus", "productstockstatusmessage", "globaldisclaimer", "productsize", "productcolour", "specification", "aproductimages", "imagesteaser", "isnewarrival", "brands", "brand", "arrivaldate", "publishdate", "expirydate", "productsellprice", "productsellpricev2", "productrestrictedprice", "productlastprice", "productlastpricehideview", "productrrp", "productrrphideview", "productflashclass", "productflashlabel", "productflashclassv2", "productflashlabelv2", "productoffer", "rrptype", "promotion", "promotionhideview", "promotionstartdatetime", "promotionenddatetime", "uom", "acategoryhierarchical", "productdesign", "productfeature", "producttheme", "buyonline"];
 const request=async params=>{const r=await fetch('https://'+config.appId.toLowerCase()+'-dsn.algolia.net/1/indexes/'+config.index+'_title_asc/query',{method:'POST',headers:{'content-type':'application/json','x-algolia-application-id':config.appId,'x-algolia-api-key':config.restrictedApiKey},body:JSON.stringify(params),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Official B&M search HTTP '+r.status);const d=await r.json();if(!Number.isInteger(d.nbHits)||!Array.isArray(d.hits))throw Error('B&M search totals missing');return d;};
 const browse=async(filter,total)=>{const rows=[],seen=new Set();let cursor;
  do{const r=await fetch('https://'+config.appId.toLowerCase()+'-dsn.algolia.net/1/indexes/'+config.index+'_title_asc/browse',{method:'POST',headers:{'content-type':'application/json','x-algolia-application-id':config.appId,'x-algolia-api-key':config.restrictedApiKey},body:JSON.stringify(cursor?{cursor}:{filters:filter,hitsPerPage:1000,attributesToRetrieve:fields}),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Official B&M cursor access unavailable HTTP '+r.status);const d=await r.json();if(!Array.isArray(d.hits))throw Error('Official B&M cursor response missing');rows.push(...d.hits);if(rows.length>total)throw Error('B&M cursor totals changed during collection');cursor=d.cursor;if(cursor){if(seen.has(cursor))throw Error('B&M cursor loop');seen.add(cursor);}}while(cursor);
  if(new Set(rows.map(h=>h.objectID)).size!==total)throw Error('B&M cursor did not reconcile its exact declared total');return rows;
 };
 const collect=async(filter,label,visited=new Set())=>{
  if(visited.has(filter))throw Error('B&M category partition loop');visited.add(filter);
  const params={query:'',hitsPerPage:100,page:0,filters:filter,attributesToRetrieve:fields,clickAnalytics:false,facets:['acategoryhierarchical.lvl1','acategoryhierarchical.lvl2','acategoryhierarchical.lvl3'],maxValuesPerFacet:1000},first=await request(params),total=first.nbHits,pages=first.nbPages;
  if(!Number.isInteger(pages)||pages<0)throw Error('B&M declared pagination is invalid');let rows=[...first.hits];
  if(pages*100>=total){for(let page=1;page<pages;page++){const d=await request({...params,page});if(d.nbHits!==total||d.nbPages!==pages)throw Error('B&M directory changed during pagination: '+label);rows.push(...d.hits);}}
  else{
   // The search API itself may expose only a result window. Partition by its
   // actual public category facets, including products lacking a child facet.
   const partition=Object.entries(first.facets||{}).map(([attribute,values])=>({attribute,values:Object.entries(values).filter(([path,count])=>path.startsWith(label+' > ')&&count>0&&count<total).map(([path])=>path)})).find(p=>p.values.length);
   if(partition){rows=[];for(const value of partition.values)rows.push(...await collect(filter+' AND '+partition.attribute+':'+JSON.stringify(value),value,new Set(visited)));const rest=filter+partition.values.map(value=>' AND NOT '+partition.attribute+':'+JSON.stringify(value)).join('');rows.push(...await collect(rest,label,new Set(visited)));}
   else rows=await browse(filter,total);
  }
  const unique=[...new Map(rows.map(h=>[String(h.objectID),h])).values()];if(unique.length!==total)throw Error('B&M category not complete: '+label+' '+unique.length+'/'+total);return unique;
 };
 const root=await request({query:'',hitsPerPage:1,page:0,filters:'acategoryhierarchical.lvl0:"Christmas"',facets:['acategoryhierarchical.lvl1','acategoryhierarchical.lvl2','acategoryhierarchical.lvl3'],maxValuesPerFacet:1000,attributesToRetrieve:fields});
 const paths=[...new Set(Object.values(root.facets||{}).flatMap(f=>Object.keys(f)))],definitions=[['trees',/^Christmas > Christmas Trees$/i],['baubles',/^Christmas > Christmas Decorations > Baubles (?:&|and) Tree Decorations$/i],['lights',/^Christmas > Christmas Lights$/i],['wreaths-garlands',/^Christmas > Christmas Decorations > Wreaths (?:&|and) Garlands$/i],['outdoor',/^Christmas > Christmas Decorations > Outdoor Decorations$/i]],categories=[];
 for(const [id,pattern]of definitions){const path=paths.find(p=>pattern.test(p));if(!path)throw Error('B&M official category not found: '+id+'; paths: '+JSON.stringify(paths));const attribute='acategoryhierarchical.lvl'+(path.split(' > ').length-1),filter=attribute+':'+JSON.stringify(path),rows=(await collect(filter,path)).map(({_highlightResult,_snippetResult,...hit})=>hit);
  categories.push({id,path,declared:rows.length,rows});
 }
 return {sourceUrl:location.href,observedAt:new Date().toISOString(),rootTotal:root.nbHits,categories,complete:true,transport:'official-B&M-public-search-from-real-site-origin'};
}
export const bmDirectoryScript=()=> '('+readBmDirectoryInsideSite.toString()+')()';
