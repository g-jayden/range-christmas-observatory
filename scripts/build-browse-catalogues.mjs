import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DEPARTMENTS,inDepartment,availableProducts,isNew,isToday,isThemeScope,beijingDay} from '../web/catalogue-model.mjs';
import {isSpringScope} from '../web/spring-model.mjs';
import {retailerForScope} from '../web/retailers.mjs';
import {browseIndexProduct} from '../web/catalogue-loader.mjs';
import {createCardPreviewBuilder,inlineFirstCardPreviews} from './build-card-previews.mjs';

// Build immutable department views from the already-published snapshot. Every
// product field and original gallery survives; browsing never recollects data.
export async function buildBrowseCatalogues(root='public',{departments=DEPARTMENTS,previews=true,sourceRoot='web',fullViews=true}={}){
 const loaded=new Map(),scopes={};let wholeBytes=0,viewBytes=0;
 const cards=previews?createCardPreviewBuilder(root,{sourceRoot}):null;
 const read=async file=>{if(!loaded.has(file))loaded.set(file,fs.readFile(path.join(root,file),'utf8').then(s=>({data:JSON.parse(s),bytes:Buffer.byteLength(s)})).catch(e=>{if(e.code==='ENOENT')return null;throw e;}));return loaded.get(file);};
 await fs.mkdir(path.join(root,'browse'),{recursive:true});
 const identities=(await read('product-identities.json'))?.data||{};
 for(const {id}of departments){
  const retailerId=retailerForScope(id),base=retailerId==='the-range'?(isSpringScope(id)?'spring/catalogue.json':id.startsWith('theme-')?'themes.json':'classified/'+id+'.json'):retailerId+'/catalogue.json';
  let source=await read(base);if(!source)continue;
  if(source.data.departmentShards?.[id])source=await read(source.data.departmentShards[id]);if(!source)throw Error('Published department shard missing: '+id);
  const arrivals=retailerId==='the-range'&&!isSpringScope(id)?await read('new-arrivals.json'):null;
  const products=(arrivals?availableProducts(source.data,arrivals.data):source.data.products||[]).filter(p=>inDepartment(p,id));
  if(cards)for(let start=0;start<products.length;start+=32){const prepared=await Promise.all(products.slice(start,start+32).map(p=>cards.build(p)));products.splice(start,prepared.length,...prepared);}
  if(cards){const visible=products.filter(p=>{const key=retailerId+':'+p.sku;return !identities.canonical?.[key]&&(!identities.primary?.[key]||isThemeScope(id)||id==='lights'||identities.primary[key]===id)&&(retailerId==='the-range'||p.inStock&&p.recordType==='sku');});const first=new Set([...visible.slice(0,6),...visible.filter(isNew).slice(0,6),...visible.filter(p=>isToday(p)).slice(0,6)]);for(let i=0;i<products.length;i++)if(first.has(products[i]))products[i]=await cards.warmNative(products[i]);}
  const data={...source.data,browseScope:id,...(arrivals?{browseArrivalsApplied:true,arrivalsRevision:arrivals.data.revision}:{}),products};
  const text=fullViews?JSON.stringify(data):null,sha256=fullViews?createHash('sha256').update(text).digest('hex'):null,url=fullViews?'browse/'+id+'.'+sha256.slice(0,20)+'.json':null;
  if(fullViews)await fs.writeFile(path.join(root,url),text);
  const indexProducts=[];
  for(let start=0;start<products.length;start+=48){const rows=products.slice(start,start+48),recordText=JSON.stringify({browseScope:id,products:rows}),recordSha=createHash('sha256').update(recordText).digest('hex'),recordUrl='browse/'+id+'-rows-'+Math.floor(start/48)+'.'+recordSha.slice(0,20)+'.json';await fs.writeFile(path.join(root,recordUrl),recordText);const record={scope:id,url:recordUrl,sha256:recordSha};indexProducts.push(...rows.map(p=>browseIndexProduct(p,record)));}
  const indexHeader=Object.fromEntries(['observedAt','revision','browseScope','browseArrivalsApplied','arrivalsRevision','assets','automaticArrivalChecks','currentCollectionAttempt','baselineReady','ready','browseReady','reviewComplete','reviewPending','retailerId','collectionComplete','sourceIndexGaps','newSourceAudit'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]])),indexText=JSON.stringify({...indexHeader,browseTransport:'lazy-exact-records-v1',products:indexProducts}),indexSha=createHash('sha256').update(indexText).digest('hex'),indexUrl='browse/'+id+'-list.'+indexSha.slice(0,20)+'.json';await fs.writeFile(path.join(root,indexUrl),indexText);
  const visible=products.filter(p=>{const key=retailerId+':'+p.sku;return !identities.canonical?.[key]&&(!identities.primary?.[key]||isThemeScope(id)||id==='lights'||identities.primary[key]===id)&&(retailerId==='the-range'||p.inStock&&p.recordType==='sku');}),ordered=[...visible].sort((a,b)=>a.priceGBP-b.priceGBP),firstKeys=new Set([visible,ordered,[...ordered].reverse()].flatMap(order=>[...order.slice(0,12),...order.filter(isNew).slice(0,12),...order.filter(p=>isToday(p)).slice(0,12)]).map(p=>String(p.sku))),firstRows=visible.filter(p=>firstKeys.has(String(p.sku))),headerKeys=['observedAt','revision','browseScope','browseArrivalsApplied','arrivalsRevision','assets','automaticArrivalChecks','currentCollectionAttempt','baselineReady','ready','browseReady','reviewComplete','reviewPending','retailerId'],first={...Object.fromEntries(headerKeys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]])),browsePartial:true,browseFirstPageSize:12,browseFullCounts:{all:visible.length,new:visible.filter(isNew).length,today:visible.filter(p=>isToday(p)).length,day:beijingDay()},products:cards?await inlineFirstCardPreviews(firstRows,new Set([visible,visible.filter(isNew),visible.filter(p=>isToday(p))].flatMap(rows=>rows.slice(0,12)).map(p=>String(p.sku))),{root}):firstRows},firstText=JSON.stringify(first),firstSha=createHash('sha256').update(firstText).digest('hex'),firstUrl='browse/'+id+'-first.'+firstSha.slice(0,20)+'.json';
  await fs.writeFile(path.join(root,firstUrl),firstText);scopes[id]={retailerId,url:fullViews?url:indexUrl,sha256:fullViews?sha256:indexSha,...(!fullViews?{fullViewMode:'lazy-exact-records-v1'}:{}),observedAt:data.observedAt,revision:data.revision,products:products.length,fastPreviews:products.filter(p=>p.fastPreview).length,bytes:fullViews?Buffer.byteLength(text):Buffer.byteLength(indexText),firstScreen:{url:firstUrl,sha256:firstSha,bytes:Buffer.byteLength(firstText)},directoryIndex:{url:indexUrl,sha256:indexSha,bytes:Buffer.byteLength(indexText)}};wholeBytes+=source.bytes;viewBytes+=fullViews?Buffer.byteLength(text):Buffer.byteLength(indexText);
 }
 const status=await read('status.json');if(status){const s=status.data;await fs.writeFile(path.join(root,'browse-status.json'),JSON.stringify({revision:s.revision,lastDirectorySuccess:s.lastDirectorySuccess,lastSuccess:s.lastSuccess,collectionAudit:{sourceObservedAt:s.collectionAudit?.sourceObservedAt,native:{firecrawlCredits:s.collectionAudit?.native?.firecrawlCredits}}}));}
 const monitor=await read('monitor-state.json');if(monitor){const fields=['state','nextRunAt','lastSuccess','lastError','pendingDeliveries','blockedDeliveries','sourceRetryAt','sourceRetryExhausted','evidenceRetryAt','evidenceRetryExhausted'];await fs.writeFile(path.join(root,'monitor-summary.json'),JSON.stringify(Object.fromEntries(fields.filter(k=>k in monitor.data).map(k=>[k,monitor.data[k]]))));}
 const manifest={format:'immutable-department-views-v1',scopes};manifest.revision=createHash('sha256').update(JSON.stringify(scopes)).digest('hex');
 await fs.writeFile(path.join(root,'browse-index.json'),JSON.stringify(manifest));return {departments:Object.keys(scopes).length,wholeCatalogueBytesForEquivalentSelections:wholeBytes,departmentBytes:viewBytes,previews:cards?.stats(),sourceRequests:cards?.stats().sourceRequests||0,sourceDirectoriesRequested:0,firecrawlCredits:0};
}
