import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {PREVIEW_QUALITY_VERSION,analysePreviewFiles,readPreviewQuality,savePreviewQuality,previewProblems,previewQualityScore} from './preview-quality.mjs';
const REGISTRY='web/preview-selections.json.gz',SOURCE_INDEX='web/preview-source-index.json.gz';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const readGzip=async(file,fallback)=>{try{return JSON.parse(gunzipSync(await fs.readFile(file)));}catch(e){if(e.code!=='ENOENT')throw e;return fallback;}};
const writeGzip=async(file,value)=>{await fs.writeFile(file+'.tmp',gzipSync(JSON.stringify(value)));await fs.rename(file+'.tmp',file);};
export function previewCandidates(p){
 const result=new Map,add=(url,originalUrl=url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.therange.co.uk'||!u.pathname.startsWith('/media/'))return;result.set(url,{url,originalUrl});}catch{}};
 for(const g of p.originalImages||[])if(String(g.selectedSku)===String(p.sku)&&(!p.variantId||!g.variantId||String(p.variantId)===String(g.variantId)))add(g.url);
 for(const url of [p.variantImageUrl,p.listingVariantImageUrl,...p.images||[]])add(url);
 return [...result.values()];
}
export const previewInput=p=>digest([String(p.sku),p.variantId||null,p.sourceUrl?.split('#')[0],p.listingVariantImageUrl||p.imageUrl||p.variantImageUrl,p.displayImage?.sha256||null,previewCandidates(p).map(g=>g.url).sort()]);
export async function applyProductPreviews(products){
 const registry=await readGzip(REGISTRY,{version:PREVIEW_QUALITY_VERSION,products:{}}),verified=new Set;let applied=0;
 for(const p of products){delete p.previewImage;delete p.previewAudit;const r=registry.products[p.sku];if(!r||r.version!==PREVIEW_QUALITY_VERSION||r.inputFingerprint!==previewInput(p))continue;
  p.previewAudit={version:r.version,status:r.status,issues:r.remainingIssues||[],checkedAt:r.checkedAt,inputFingerprint:r.inputFingerprint};
  if(!r.selected||p.displayImage)continue;
  if(!previewCandidates(p).some(g=>g.url===r.selected.sourceUrl))continue;
  const selected=r.selected;if(!/^images\/previews\/[a-f0-9]{64}\.webp$/.test(selected.cachePath))continue;
  if(!verified.has(selected.cachePath)){const bytes=await fs.readFile('web/'+selected.cachePath).catch(()=>null);if(!bytes||createHash('sha256').update(bytes).digest('hex')!==selected.sha256)continue;verified.add(selected.cachePath);}
  p.previewImage=selected;applied++;
 }return {applied,registered:Object.keys(registry.products).length};
}
// Executed only in the existing authorised Firecrawl page. The original URL,
// original dimensions and original digest are retained; the derived WebP is
// a faithful, uncropped preview, never a replacement for the source original.
export async function readPreviewAssets({urls,maxSide=600}){
 const result=[],deadline=Date.now()+47000;let cursor=0;
 await Promise.all(Array.from({length:16},async()=>{while(cursor<urls.length&&Date.now()<deadline){const url=urls[cursor++];try{
  const target=new URL(url);if(target.origin!=='https://www.therange.co.uk'||!target.pathname.startsWith('/media/'))throw Error('Unexpected image origin');
  const r=await fetch(url,{credentials:'include',signal:AbortSignal.timeout(9000)});if(!r.ok){result.push({url,status:r.status,ok:false});continue;}
  const blob=await r.blob();if(!blob.type.startsWith('image/'))throw Error('Not an image');const bitmap=await createImageBitmap(blob),sourceWidth=bitmap.width,sourceHeight=bitmap.height;
  if(sourceWidth<64||sourceHeight<64){bitmap.close();result.push({url,ok:false,error:'source-placeholder'});continue;}
  const ratio=Math.min(1,maxSide/sourceWidth,maxSide/sourceHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sourceWidth*ratio));canvas.height=Math.max(1,Math.round(sourceHeight*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const preview=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!preview)throw Error('Preview encoding failed');const buffer=new Uint8Array(await preview.arrayBuffer());let binary='';for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));
  const sourceHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
  result.push({url,ok:true,sourceWidth,sourceHeight,width:canvas.width,height:canvas.height,sourceHash,dataBase64:btoa(binary)});
 }catch(e){result.push({url,ok:false,error:String(e.message).slice(0,160)});}}}));while(cursor<urls.length)result.push({url:urls[cursor++],ok:false,deferred:true});return result;
}
export async function optimiseProductPreviews(products,{reader=null,maxBatches=30,maxCandidates=5,batchSize=320,prioritySkus=[]}={}){
 const {cache:quality}=await analysePreviewFiles(products.flatMap(p=>{const hash=p.displayImage?.sha256||p.imageCacheEvidence?.sha256,file=p.displayImage?.cachePath||p.cachedImageUrl;return hash&&file?[{hash,file:'web/'+file}]:[]}));
 const registry=await readGzip(REGISTRY,{version:PREVIEW_QUALITY_VERSION,products:{}}),index=await readGzip(SOURCE_INDEX,{version:1,entries:{}}),work=[];
 for(const p of products){if(p.taxonomyAudit&&p.taxonomyAudit.disposition!=='include')continue;const prior=registry.products[p.sku],inputFingerprint=previewInput(p);if(prior?.version===PREVIEW_QUALITY_VERSION&&prior.inputFingerprint===inputFingerprint&&!['pending','pending-asset'].includes(prior.status))continue;
  const baseHash=p.displayImage?.sha256||p.imageCacheEvidence?.sha256,baseQuality=quality.entries[baseHash],issues=baseQuality?previewProblems(baseQuality):['unavailable'],pair=p.originalImages?.find(g=>g.url===p.originalImageUrl),mismatch=Boolean(!p.displayImage&&p.originalImageUrl&&pair?.thumbnail!==p.imageCacheEvidence?.sourceUrl);
  const candidates=previewCandidates(p),needs=!p.displayImage&&(issues.length>0||mismatch);let chosen=candidates;
  if(candidates.length>maxCandidates&&!prioritySkus.includes(p.sku)){const positions=[0,1,2,candidates.length-1,Math.floor(candidates.length/2)];chosen=[...new Set(positions)].slice(0,maxCandidates).map(n=>candidates[n]);}
  if(!needs){registry.products[p.sku]={version:PREVIEW_QUALITY_VERSION,inputFingerprint,status:'kept',checkedAt:new Date().toISOString(),remainingIssues:issues};continue;}
  // Always include the currently displayed original so that comparisons are
  // made against the actual preview, not an unrelated listing thumbnail.
  if(p.originalImageUrl&&candidates.some(c=>c.url===p.originalImageUrl)&&!chosen.some(c=>c.url===p.originalImageUrl))chosen.push(candidates.find(c=>c.url===p.originalImageUrl));
  work.push({p,inputFingerprint,baseHash,baseQuality,issues,mismatch,candidates:chosen});
 }
 await fs.mkdir('runtime/preview-candidates',{recursive:true});const requests=[...new Set(work.flatMap(w=>w.candidates.map(c=>c.url)))].filter(url=>!index.entries[url]?.hash||!quality.entries[index.entries[url].hash]);let fetched=0,batches=0,failed=0;
 if(reader)for(let offset=0;offset<requests.length&&batches<maxBatches;offset+=batchSize){const urls=requests.slice(offset,offset+batchSize);const results=await reader.previewAssets(urls,{maxSide:320});batches++;if(results.length!==urls.length||new Set(results.map(r=>r.url)).size!==urls.length||results.some(r=>!urls.includes(r.url)))throw Error('Preview asset batch did not reconcile');
  if(batches===1&&results.filter(r=>r.ok).length<results.length*.2)throw Error('Preview source channel failed; stopped before more paid batches');
  for(const r of results){if(!r.ok){failed++;index.entries[r.url]={error:r.error||'HTTP '+r.status,status:r.status,checkedAt:new Date().toISOString()};continue;}const bytes=Buffer.from(r.dataBase64,'base64'),hash=createHash('sha256').update(bytes).digest('hex'),file='runtime/preview-candidates/'+hash+'.webp';await fs.writeFile(file,bytes);const {dataBase64,...meta}=r;index.entries[r.url]={...meta,hash,file,checkedAt:new Date().toISOString()};fetched++;}
  await writeGzip(SOURCE_INDEX,index);console.log(JSON.stringify({phase:'preview-gallery-download',checked:Math.min(offset+batchSize,requests.length),total:requests.length,batches,fetched,failed}));
 }
 const downloaded=Object.values(index.entries).filter(r=>r.hash&&!quality.entries[r.hash]);const usable=[];for(const r of downloaded)try{await fs.access(r.file);usable.push({hash:r.hash,file:r.file});}catch{}
 await analysePreviewFiles(usable);const updatedQuality=await readPreviewQuality();await fs.mkdir('web/images/previews',{recursive:true});let changed=0,limited=0,pending=0;
 for(const w of work){const choices=w.candidates.map(c=>({candidate:c,asset:index.entries[c.url]})).filter(x=>x.asset?.hash&&updatedQuality.entries[x.asset.hash]).map(x=>({...x,quality:updatedQuality.entries[x.asset.hash]})).sort((a,b)=>previewQualityScore(b.quality)-previewQualityScore(a.quality));
  const current=choices.find(c=>c.candidate.url===w.p.originalImageUrl),base=current?.quality||w.baseQuality,best=choices[0];
  if(!best){const exhausted=w.candidates.length&&w.candidates.every(c=>index.entries[c.url]?.status===403||index.entries[c.url]?.status===404);if(exhausted||!w.candidates.length){registry.products[w.p.sku]={version:PREVIEW_QUALITY_VERSION,inputFingerprint:w.inputFingerprint,status:'unavailable',checkedAt:new Date().toISOString(),remainingIssues:['source-unavailable']};limited++;}else pending++;continue;}
  const bestIssues=previewProblems(best.quality),baseScore=base?previewQualityScore(base):-10,better=best.candidate.url!==w.p.originalImageUrl&&previewQualityScore(best.quality)>baseScore+.09,hasActualCurrent=Boolean(current),use=better||hasActualCurrent&&w.mismatch&&best.candidate.url===w.p.originalImageUrl;
  const r={version:PREVIEW_QUALITY_VERSION,inputFingerprint:w.inputFingerprint,status:bestIssues.some(i=>['logo','diagram','detail','cropped'].includes(i))?'limited':'kept',checkedAt:new Date().toISOString(),remainingIssues:bestIssues,compared:choices.length};
  if(use){const bytes=await fs.readFile(best.asset.file).catch(()=>null),cachePath='images/previews/'+best.asset.hash+'.webp';if(bytes)await fs.writeFile('web/'+cachePath,bytes);r.selected={selectedSku:w.p.sku,sourceUrl:best.candidate.url,sourceProductUrl:w.p.sourceUrl,cachePath:bytes?cachePath:null,sha256:best.asset.hash,width:bytes?best.asset.width:0,height:bytes?best.asset.height:0,originalWidth:best.asset.sourceWidth,originalHeight:best.asset.sourceHeight,originalSha256:best.asset.sourceHash,method:'same-SKU-gallery-whole-product-selection',verifiedAt:r.checkedAt};r.status=bytes?(bestIssues.some(i=>['logo','diagram','detail','cropped'].includes(i))?'limited':'selected'):'pending-asset';changed++;}
  if(r.status==='limited')limited++;registry.products[w.p.sku]=r;
 }
 const upgrades=[...new Set(Object.values(registry.products).filter(r=>r.selected&&!r.upgradeAttemptedAt&&Math.max(r.selected.width,r.selected.height)<Math.min(600,Math.max(r.selected.originalWidth,r.selected.originalHeight))).map(r=>r.selected.sourceUrl))];
 if(reader)for(let offset=0;offset<upgrades.length&&batches<maxBatches;offset+=100){const urls=upgrades.slice(offset,offset+100),results=await reader.previewAssets(urls,{maxSide:600});batches++;for(const asset of results){for(const r of Object.values(registry.products).filter(r=>r.selected?.sourceUrl===asset.url))r.upgradeAttemptedAt=new Date().toISOString();if(!asset.ok)continue;const bytes=Buffer.from(asset.dataBase64,'base64'),hash=createHash('sha256').update(bytes).digest('hex'),cachePath='images/previews/'+hash+'.webp',prior=index.entries[asset.url];await fs.writeFile('web/'+cachePath,bytes);if(prior?.hash&&updatedQuality.entries[prior.hash])updatedQuality.entries[hash]=updatedQuality.entries[prior.hash];const {dataBase64,...meta}=asset;index.entries[asset.url]={...meta,hash,file:'web/'+cachePath,checkedAt:new Date().toISOString()};for(const r of Object.values(registry.products).filter(r=>r.selected?.sourceUrl===asset.url))Object.assign(r.selected,{cachePath,sha256:hash,width:asset.width,height:asset.height,originalWidth:asset.sourceWidth,originalHeight:asset.sourceHeight,originalSha256:asset.sourceHash});}console.log(JSON.stringify({phase:'preview-resolution-upgrade',checked:Math.min(offset+100,upgrades.length),total:upgrades.length,batches}));}
 for(const r of Object.values(registry.products))if(r.selected?.cachePath&&r.status==='pending-asset')r.status='selected';else if(r.status==='pending-asset')pending++;
 const retained=new Set(Object.values(registry.products).map(r=>r.selected?.cachePath).filter(Boolean));for(const file of await fs.readdir('web/images/previews'))if(!retained.has('images/previews/'+file))await fs.unlink('web/images/previews/'+file);
 await savePreviewQuality(updatedQuality);await writeGzip(SOURCE_INDEX,index);await writeGzip(REGISTRY,registry);const status={version:PREVIEW_QUALITY_VERSION,revision:digest(registry),checkedAt:new Date().toISOString(),products:products.length,registered:Object.keys(registry.products).length,changed,limited,pending,sourceRequestsMade:batches>0,batches,fetched,failed,categoryOrArrivalHistoryChanged:false};await fs.writeFile('web/preview-status.json',JSON.stringify(status));console.log(JSON.stringify({phase:'whole-product-previews',...status}));return status;
}

// Normal updates reuse every unchanged proof. Only new/changed SKU galleries
// share the already-authorised collection reader, with at most two batches;
// this helper never opens a separate paid session or retries a whole catalogue.
export async function optimiseChangedProductPreviews(products,reader){
 if(!reader?.previewAssets)return {changed:0,sourceRequestsMade:false};
 const registry=await readGzip(REGISTRY,null);if(!registry||registry.version!==PREVIEW_QUALITY_VERSION)return {changed:0,initialAuditPending:true,sourceRequestsMade:false};
 const unique=[...new Map(products.map(p=>[p.sku,p])).values()],changed=unique.filter(p=>p.imageCacheEvidence?.sha256&&(!registry.products[p.sku]||registry.products[p.sku].inputFingerprint!==previewInput(p)));
 if(!changed.length)return {changed:0,sourceRequestsMade:false};
 const previous=await fs.readFile('web/preview-status.json','utf8').then(JSON.parse).catch(()=>({}));
 try{const result=await optimiseProductPreviews(changed,{reader,maxBatches:2,batchSize:160,maxCandidates:3});await fs.writeFile('web/preview-status.json',JSON.stringify({...previous,revision:result.revision,registered:result.registered,lastIncremental:result}));return result;}
 catch(error){const result={changed:changed.length,error:String(error.message).slice(0,200),checkedAt:new Date().toISOString(),boundedBatches:2};await fs.writeFile('web/preview-status.json',JSON.stringify({...previous,lastIncremental:result}));console.error(JSON.stringify({phase:'incremental-preview-bounded-stop',...result}));return result;}
}
