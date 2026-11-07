import {apiUrl,SourceError} from './sync.mjs';
// A large equal-price group is not stably ordered by the retailer. Partition
// with its real facets, so each final request can be checked independently.
export async function collectPartitionedCategory(id,reader){
 let root=await reader(apiUrl(id,0,{in_stock_f:['true']},true));
 if(root.totalResults===0)return {products:[],audit:{expected:0,observed:0,unique:0,complete:true,rootCategoryId:id,requests:1,records:[]}};
 const brands=root.facets?.find(f=>f.id==='brand_f')?.options;
 if(!brands?.length)throw new SourceError('Official brand facet required for complete large-catalogue coverage');
 let target=root.totalResults;const all=new Map(),partitions=[],batches=[],facets=root.facets,reconciliations=[];
 let requests=1;
 const urlFor=(offset,filters,sort='price_lth')=>{const u=new URL(apiUrl(id,offset,filters));u.searchParams.set('sort',sort);return u.href;};
 async function fetchPage(filters,offset=0,sort='price_lth'){
  const url=urlFor(offset,filters,sort),d=await reader(url);requests++;batches.push({url,offset,count:d.products.length,total:d.totalResults});return d;
 }
 function insert(map,p){const sku=String(p.sku),old=map.get(sku);if(old&&['price','newIn','inStock','variantImageUrl'].some(k=>old[k]!==p[k]))throw new SourceError('SKU changed during partitioned source observation: '+sku);map.set(sku,p);}
 async function collect(filters,depth=0){
  const first=await fetchPage(filters),expected=first.totalResults,map=new Map();for(const p of first.products)insert(map,p);
  if(expected<=120){if(map.size!==expected)throw new SourceError('Small source partition did not reconcile');return map;}
  // Bounded forward and reverse overlap usually reconciles a medium brand.
  for(const sort of ['price_lth','price_htl']){
   for(let offset=sort==='price_lth'?80:0;offset<expected;offset+=80){const d=await fetchPage(filters,offset,sort);if(d.totalResults!==expected)reconciliations.push({category:id,filters,offset,firstPageTotal:expected,pageTotal:d.totalResults,method:'retain-all-returned-SKUs-and-reconcile-root-union'});for(const p of d.products)insert(map,p);}
   if(map.size===expected)return map;
  }
  if(depth>=3)throw new SourceError('Source partition remains incomplete; refusing omitted SKUs: '+map.size+'/'+expected);
  // price_f is a range facet; the source ignores arrays of exact prices.
  // Never treat that ignored filter as independent coverage evidence.
  if(!filters.colour_group_f){
   const options=facets.find(f=>f.id==='colour_group_f')?.options||[];
   for(const colour of options)for(const p of (await collect({...filters,colour_group_f:[colour.name]},depth+1)).values())insert(map,p);
  }else{
   const design=facets.find(f=>f.name==='Design');if(design)for(let n=0;n<design.options.length;n+=25)for(const p of (await collect({...filters,[design.id]:design.options.slice(n,n+25).map(o=>o.name)},depth+1)).values())insert(map,p);
  }
  if(map.size!==expected)throw new SourceError('Partition coverage mismatch; no partial result published: '+map.size+'/'+expected);
  return map;
 }
 // Pack small brands into bounded OR groups; large brands get their own plan.
 const groups=[];let small=[],count=0;
 for(const b of brands){if(b.count>100){groups.push([b.name]);continue;}if(count+b.count>100&&small.length){groups.push(small);small=[];count=0;}small.push(b.name);count+=b.count;}if(small.length)groups.push(small);
 const results=new Map();
 async function checkedGroup(index){const values=groups[index];let failure;for(let attempt=0;attempt<3;attempt++)try{const part=await collect({in_stock_f:['true'],brand_f:values});results.set(index,part);return;}catch(e){failure=e;if(e.status||!/Partition count changed|SKU changed|partition.*reconcile|coverage mismatch/i.test(e.message))throw e;reconciliations.push({brands:values,attempt:attempt+1,reason:e.message});}throw failure;}
 async function runGroups(indices){let cursor=0;const workers=await Promise.allSettled(Array.from({length:Math.min(4,indices.length)},async()=>{while(cursor<indices.length)await checkedGroup(indices[cursor++]);}));const failed=workers.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
 await runGroups(groups.map((_,i)=>i));
 // Only changed brand groups are re-read. A fresh official facet response is
 // the final denominator; a moving initial count is never silently reused.
 for(let round=0;round<3;round++){
  root=await reader(apiUrl(id,0,{in_stock_f:['true']},true));requests++;target=root.totalResults;
  const currentBrands=root.facets?.find(f=>f.id==='brand_f')?.options;if(!currentBrands)throw new SourceError('Final official brand counts unavailable');
  all.clear();for(const part of results.values())for(const p of part.values())insert(all,p);
  if(all.size===target)break;
  // A brand union can contain stale members even when each group's count is
  // unchanged. Rebuild an independent root observation instead of subtracting
  // arbitrary SKUs, or unioning stale rows into every subsequent retry. Relevance
  // also avoids the unstable ordering of a large equal-price bucket.
  let coherent=false;
  for(const sort of ['relevance','price_lth','price_htl']){
   const first=await fetchPage({in_stock_f:['true']},0,sort),expected=first.totalResults,rows=new Map();let conflict=false;
   try{
    for(const p of first.products)insert(rows,p);
    for(let offset=80;offset<expected;offset+=80){const page=await fetchPage({in_stock_f:['true']},offset,sort);for(const p of page.products)insert(rows,p);}
    const end=await reader(apiUrl(id,0,{in_stock_f:['true']},true));requests++;
    if(end.totalResults===expected&&rows.size===expected){for(const p of end.products){if(!rows.has(String(p.sku)))throw new SourceError('Root membership changed during observation');insert(rows,p);}all.clear();for(const [sku,p]of rows)all.set(sku,p);target=expected;root=end;coherent=true;}
   }catch(e){if(!/SKU changed|Root membership changed/.test(e.message))throw e;conflict=true;}
   reconciliations.push({method:'independent-root-observation',sort,expected,observed:rows.size,complete:coherent,conflict});if(coherent)break;
  }
  if(coherent)break;
  // Some live SKUs do not occur in any advertised brand facet. The unfiltered
  // official catalogue is an independent coverage path, not another brand retry.
  const rootRows=new Map(),beforeRootPages=all.size;
  const includeRoot=rows=>{for(const p of rows){rootRows.set(String(p.sku),p);all.set(String(p.sku),p);}};
  includeRoot(root.products);
  if(all.size!==target)for(const sort of ['price_lth','price_htl']){
   for(let offset=sort==='price_lth'?80:0;offset<target;offset+=80){const page=await fetchPage({in_stock_f:['true']},offset,sort);includeRoot(page.products);if(all.size===target||rootRows.size===target)break;}
   if(all.size===target||rootRows.size===target)break;
  }
  if(rootRows.size===target){all.clear();for(const [sku,p]of rootRows)all.set(sku,p);}
  reconciliations.push({method:'unfiltered-root-SKU-coverage',before:beforeRootPages,after:all.size,expected:target,rootPageSkus:rootRows.size});
  if(all.size===target)break;
  if(round===2)throw new SourceError('Root total and brand-partition union do not reconcile after bounded changed-group checks: '+all.size+'/'+target+' category '+id);
  // Facet option counts include records excluded by the product-list API.
  // Only a real filtered product response supplies its exact denominator.
  const known=new Set(groups.flat()),affected=[];
  for(const brand of currentBrands)if(!known.has(brand.name)){groups.push([brand.name]);known.add(brand.name);affected.push(groups.length-1);}
  for(let index=0;index<groups.length;index++){if(affected.includes(index))continue;const header=await fetchPage({in_stock_f:['true'],brand_f:groups[index]});if(results.get(index)?.size!==header.totalResults)affected.push(index);}
  if(!affected.length)throw new SourceError('Root total and brand-partition union do not reconcile: '+all.size+'/'+target);
  const changed=new Set(affected.flatMap(index=>groups[index]));
  reconciliations.push({round:round+1,changedBrands:[...changed],expected:target,observed:all.size});await runGroups(affected);
 }
 for(const [index,part]of results)partitions.push({brands:groups[index],count:part.size,complete:true});
 return {products:[...all.values()],audit:{expected:target,observed:all.size,unique:all.size,complete:true,method:'official-brand-price-colour-facets-with-checked-partitions',rootCategoryId:id,requests,partitions,reconciliations,batches,records:[...all.keys()]}};
}
