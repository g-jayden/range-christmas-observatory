import fs from 'node:fs/promises';
import {readJlDirectoryDom} from './jl-list-dom.mjs';
import {JL_DIRECTORIES} from '../web/jl-model.mjs';
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
export function sanitiseJlFamily(p){
 if(!p?.title||!Array.isArray(p.variants)||!p.variants.length)throw Error('John Lewis public family data absent');
 return {...pick(p,['title','aliases','availability','defaultVariant','canonicalURL','pdpURL','unitOfMeasure','description','howToUse','productTypeHierarchy','sellingProductType','brand','attributes','messaging','icons']),variants:p.variants.map(v=>pick(v,['id','title','canonicalURL','pdpURL','displayCode','messaging','price','availability','images','aliases','differentiators','colour','attributes']))};
}
export async function collectJl({checkpointDir='runtime/jl-family',onBatch=()=>{}}={}){
 const {firefox}=await import('../runtime/jl-probe/node_modules/playwright/index.mjs');
 await fs.mkdir(checkpointDir,{recursive:true});const browser=await firefox.launch({headless:true}),context=await browser.newContext(),page=await context.newPage();let listingPage=await context.newPage();
 const result={observedAt:new Date().toISOString(),transport:'John-Lewis-clean-Firefox-public-HTML',firecrawlCredits:0,sourceRequests:0,categories:[],families:{},failures:[],complete:false};
 try{
  const first='https://www.johnlewis.com'+JL_DIRECTORIES[0][1],response=await page.goto(first,{waitUntil:'domcontentloaded',timeout:45000});result.sourceRequests++;
  if(response.status()!==200)throw Error('John Lewis landing HTTP '+response.status());
  await page.locator('article[data-product-id]').first().waitFor({timeout:20000});
  const request=async(url,kind)=>{for(let attempt=0;attempt<3;attempt++){result.sourceRequests++;try{
   if(kind==='directory'){
    if(attempt>0){await listingPage.close();listingPage=await context.newPage();}const current=listingPage;
    if(current.url()!==url){const response=await current.goto(url,{waitUntil:'domcontentloaded',timeout:35000});if([401,403,429].includes(response.status()))throw Object.assign(Error('John Lewis official refusal HTTP '+response.status()),{stop:true});if(response.status()!==200)throw Error('John Lewis directory HTTP '+response.status());}
    await current.locator('article[data-product-id]').first().waitFor({timeout:15000});const row=await current.evaluate(readJlDirectoryDom);
    if(!row.count||!row.rows.length||!/John Lewis/i.test(await current.title())||/Technical Problem|Access Denied/i.test(await current.title()))throw Error('John Lewis directory content incomplete: '+await current.title());
    return {...row,status:200};
   }
   const suppliedHtml=null;
   const data=await page.evaluate(async({url,kind,suppliedHtml})=>{
    let html=suppliedHtml;if(!html){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(r.status!==200)return {status:r.status};html=await r.text();}const d=new DOMParser().parseFromString(html,'text/html');
    if(kind==='family'){const s=d.querySelector('#__NEXT_DATA__');return {status:200,product:s?JSON.parse(s.textContent).props?.pageProps?.product:null};}
    d.querySelectorAll('script,style,noscript').forEach(n=>n.remove());const text=n=>(n?.textContent||'').trim(),href=a=>a?new URL(a.getAttribute('href'),url).href:null;
    const rows=[...d.querySelectorAll('article[data-product-id]')].map(c=>{const links=[...c.querySelectorAll('a[href]')],isProduct=a=>/\/p\d+$/.test(new URL(href(a)).pathname),p=links.find(a=>isProduct(a)&&text(a)&&!text(a).startsWith('£'))||links.find(isProduct),range=!p&&links.find(a=>text(a)==='View range');return {pageProductId:c.getAttribute('data-product-id'),type:range?'range-navigation':'product',name:text(p)||text(c.querySelector('h2,h3')),sourceUrl:href(p||range)?.split('#')[0],sponsored:/\bSponsored\b/.test(text(c)),unavailable:/Email when available/.test(text(c))};});
    const body=text(d.body),count=body.match(/(\d+)\s*[-–]\s*(\d+)\s*of\s*([\d,]+)/)?.slice(1).map(v=>+v.replaceAll(',',''));
    const next=[...d.querySelectorAll('a[href]')].find(a=>text(a)==='Next'&&href(a).includes('page='));return {status:200,url,title:text(d.querySelector('h1')),count,next:href(next),rows};
   },{url,kind,suppliedHtml});
   if([401,403,429].includes(data.status))throw Object.assign(Error('John Lewis official refusal HTTP '+data.status),{stop:true});
   if(data.status!==200)throw Error('John Lewis official source HTTP '+data.status);
   if(kind==='family'&&!data.product)throw Error('John Lewis family JSON absent');return data;
  }catch(e){if(e.stop||attempt===2)throw e;await new Promise(r=>setTimeout(r,700*(attempt+1)));}}
  };
  const rangeCache=new Map(),directory=async url=>{const pages=[],seen=new Set();for(let next=url;next;){if(seen.has(next)||pages.length>30)throw Error('John Lewis pagination loop');seen.add(next);const p=await request(next,'directory');pages.push(p);await onBatch({directoryPage:p});next=p.next;if(next){try{await listingPage.getByRole('link',{name:'Next',exact:true}).click({timeout:15000});await listingPage.waitForURL(next,{timeout:20000,waitUntil:'domcontentloaded'});}catch{}}}return pages;};
  for(const[id,path]of JL_DIRECTORIES){const c={id,pages:await directory('https://www.johnlewis.com'+path),ranges:[]};for(const row of c.pages.flatMap(p=>p.rows).filter(r=>!r.sponsored&&r.type==='range-navigation')){if(!row.sourceUrl)throw Error('John Lewis range URL absent');if(!rangeCache.has(row.sourceUrl))rangeCache.set(row.sourceUrl,await directory(row.sourceUrl));c.ranges.push({url:row.sourceUrl,pages:rangeCache.get(row.sourceUrl)});}result.categories.push(c);console.log(JSON.stringify({phase:'John Lewis directory',id,count:c.pages[0]?.count?.[2],pages:c.pages.length,ranges:c.ranges.length}));}
  const unique=new Map();for(const c of result.categories)for(const p of [...c.pages,...c.ranges.flatMap(r=>r.pages)])for(const r of p.rows.filter(r=>!r.sponsored&&r.type!=='range-navigation'))unique.set(r.pageProductId,r.sourceUrl);
  const items=[...unique],batch=[];let cursor=0,stopped=false;
  await Promise.all(Array.from({length:2},async()=>{while(cursor<items.length&&!stopped){const[id,url]=items[cursor++];try{const data=await request(url,'family'),family=sanitiseJlFamily(data.product);family.sourceUrl=url;family.pageProductId=id;family.observedAt=new Date().toISOString();result.families[id]=family;await fs.writeFile(checkpointDir+'/'+id+'.json',JSON.stringify(family));batch.push(family);if(batch.length>=20){await onBatch(batch.splice(0));console.log(JSON.stringify({phase:'John Lewis families',done:Object.keys(result.families).length,total:items.length,failed:result.failures.length}));}}catch(e){result.failures.push({id,url,error:e.message});if(e.stop)stopped=true;}}}));
  if(batch.length)await onBatch(batch.splice(0));result.complete=!result.failures.length&&Object.keys(result.families).length===items.length;result.uniqueParentCodes=items.length;
 }catch(e){result.failures.push({error:e.message});}finally{await browser.close();}
 await fs.writeFile(checkpointDir+'/source.json',JSON.stringify(result));return result;
}
