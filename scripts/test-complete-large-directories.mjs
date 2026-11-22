import assert from 'node:assert/strict';
import {readBmDirectoryInsideSite} from '../server/bm-source.mjs';
import {jlBatchAction} from '../server/jl-paid-source.mjs';
const saved={fetch:globalThis.fetch,location:globalThis.location,document:globalThis.document,DOMParser:globalThis.DOMParser};
const paths=['Christmas > Christmas Trees','Christmas > Christmas Decorations > Baubles & Tree Decorations','Christmas > Christmas Lights','Christmas > Christmas Decorations > Wreaths & Garlands','Christmas > Christmas Decorations > Outdoor Decorations'];
const all=Array.from({length:1501},(_,i)=>({objectID:String(i),title:'Exact tree '+i}));
try{
 globalThis.location={origin:'https://www.bmstores.co.uk',href:'https://www.bmstores.co.uk/products/christmas'};globalThis.document={querySelector:()=>({textContent:JSON.stringify({appId:'TESTPUBLIC',index:'prod_bmstores',restrictedApiKey:'public-fixture'})})};
 let cursorReads=0,mode='partition';
 globalThis.fetch=async(url,options)=>{const p=JSON.parse(options.body);
  if(url.endsWith('/browse')){cursorReads++;if(mode==='cursor-loop')return Response.json({hits:all.slice(0,100),cursor:'repeat'});const offset=Number(p.cursor||0),hits=all.slice(offset,offset+1000);return Response.json({hits,...(offset+1000<all.length?{cursor:String(offset+1000)}:{})});}
  if(p.filters==='acategoryhierarchical.lvl0:"Christmas"')return Response.json({nbHits:1505,nbPages:1,hits:[],facets:{'acategoryhierarchical.lvl2':Object.fromEntries(paths.map(x=>[x,1]))}});
  const tree=p.filters.includes('Christmas > Christmas Trees');let rows=tree?all:[{objectID:p.filters}];
  if(tree&&p.filters.includes(' AND NOT '))rows=all.slice(1250);
  else if(tree&&p.filters.includes(' > Small'))rows=all.slice(0,750);
  else if(tree&&p.filters.includes(' > Large'))rows=all.slice(500,1250);
  const truncated=tree&&rows===all,facets=truncated&&mode==='partition'?{'acategoryhierarchical.lvl2':{[paths[0]+' > Small']:750,[paths[0]+' > Large']:750}}:{};
  return Response.json({nbHits:rows.length,nbPages:truncated?10:Math.ceil(rows.length/100),hits:rows.slice(p.page*100,p.page*100+100),facets});
 };
 const partition=await readBmDirectoryInsideSite();assert.equal(partition.categories[0].rows.length,1501);assert.equal(cursorReads,0,'Public child facets should resolve a search window without acquiring extra API permissions');assert.equal(new Set(partition.categories[0].rows.map(r=>r.objectID)).size,1501,'Overlapping child facets must not duplicate product records');
 mode='cursor';const cursor=await readBmDirectoryInsideSite();assert.equal(cursor.categories[0].rows.length,1501);assert.equal(cursorReads,2,'A genuine source cursor may continue beyond its 1000-hit search window');
 mode='cursor-loop';await assert.rejects(readBmDirectoryInsideSite(),/cursor loop/);

 let count=0;
 const element=text=>({textContent:text}),article={getAttribute:()=>String(count),querySelectorAll:()=>[{getAttribute:()=>'/product/p'+count,textContent:'Exact tree '+count}],querySelector:()=>element('Exact tree '+count),textContent:'Exact tree '+count};
 globalThis.DOMParser=class{parseFromString(){count++;return{title:'John Lewis',body:element(count+' - '+count+' of 41'),querySelectorAll:selector=>selector==='script,style,noscript'?[]:selector==='article[data-product-id]'?[article]:selector==='a[href]'&&count<41?[{textContent:'Next',getAttribute:()=>'/trees?page='+(count+1)}]:[],querySelector:()=>element('Trees')};}};
 globalThis.fetch=async()=>new Response('<html>Official fixture page</html>');
 const result=await(0,eval)(jlBatchAction([{id:'trees',url:'https://www.johnlewis.com/trees?page=1'}],{directories:true}));
 assert.equal(result.failures.length,0,JSON.stringify(result.failures));assert.equal(result.rows[0].pages.length,41,'A complete John Lewis category may continue beyond the former 30-page cap');assert.equal(result.requests,41);
 console.log('Large official directories complete past old 1000-item/30-page windows: B&M partitions overlapping source facets or follows its genuine cursor, rejects repeated cursors, and John Lewis reads all 41 declared pages.');
}finally{for(const[k,v]of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
