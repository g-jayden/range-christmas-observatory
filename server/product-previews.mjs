import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {PREVIEW_QUALITY_VERSION,analysePreviewFiles,readPreviewQuality,savePreviewQuality,previewProblems,previewQualityScore} from './preview-quality.mjs';
const REGISTRY='web/preview-selections.json.gz',SOURCE_INDEX='web/preview-source-index.json.gz';
const SELECTION_VERSION='complete-border-selection-20261104-v3';
// Human-reviewed whole-product frames from these exact SKU galleries. A URL
// is eligible only while the current verified SKU gallery still contains it.
import{REVIEWED_WHOLE_SOURCES}from'../web/source-photo-selection.mjs';
import{exactNativeGalleryMember}from'./native-gallery-identity.mjs';
import{materializeCommittedImage}from'./committed-image-file.mjs';
import{loadPolicy}from'./collection-policy.mjs';
import{unrestrictedCollection}from'./collection-limits.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const readGzip=async(file,fallback)=>{try{return JSON.parse(gunzipSync(await fs.readFile(file)));}catch(e){if(e.code!=='ENOENT')throw e;return fallback;}};
const writeGzip=async(file,value)=>{await fs.writeFile(file+'.tmp',gzipSync(JSON.stringify(value)));await fs.rename(file+'.tmp',file);};
export function previewCandidates(p){
 const result=new Map,add=(url,originalUrl=url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.therange.co.uk'||!u.pathname.startsWith('/media/'))return;result.set(url,{url,originalUrl});}catch{}};
 for(const g of p.originalImages||[])if(exactNativeGalleryMember(p,g)&&(!p.variantId||!g.variantId||String(p.variantId)===String(g.variantId)))add(g.url);
 for(const url of [p.variantImageUrl,p.listingVariantImageUrl,...p.images||[]])add(url);
 return [...result.values()];
}
export const previewInput=p=>digest([String(p.sku),p.variantId||null,p.sourceUrl?.split('#')[0],p.listingVariantImageUrl||p.imageUrl||p.variantImageUrl,p.displayImage?.sha256||null,previewCandidates(p).map(g=>g.url).sort()]);
export async function applyProductPreviews(products,{verifyFiles=true}={}){
 const registry=await readGzip(REGISTRY,{version:PREVIEW_QUALITY_VERSION,products:{}}),verified=new Set;let applied=0;
 for(const p of products){delete p.previewImage;delete p.previewAudit;const r=registry.products[p.sku];if(!r||r.version!==PREVIEW_QUALITY_VERSION||r.inputFingerprint!==previewInput(p))continue;
  p.previewAudit={version:r.version,status:r.status,issues:r.remainingIssues||[],checkedAt:r.checkedAt,inputFingerprint:r.inputFingerprint};
  if(!r.selected||p.displayImage)continue;
  if(!previewCandidates(p).some(g=>g.url===r.selected.sourceUrl))continue;
  const selected=r.selected;if(!/^images\/previews\/[a-f0-9]{64}\.webp$/.test(selected.cachePath))continue;
  if(!/^[a-f0-9]{64}$/.test(selected.sha256||''))continue;
  if(verifyFiles&&!verified.has(selected.cachePath)){let bytes=await fs.readFile('web/'+selected.cachePath).catch(()=>null);if(!bytes)try{await materializeCommittedImage(selected.cachePath,selected.sha256);bytes=await fs.readFile('web/'+selected.cachePath);}catch{}if(!bytes||createHash('sha256').update(bytes).digest('hex')!==selected.sha256)continue;verified.add(selected.cachePath);}
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
export async function optimiseProductPreviews(products,{reader=null,maxBatches=Infinity,maxCandidates=5,batchSize=320,prioritySkus=[],nativeGalleryOnly=false}={}){
 const {cache:quality}=await analysePreviewFiles(products.flatMap(p=>{const hash=p.displayImage?.sha256||p.imageCacheEvidence?.sha256,file=p.displayImage?.cachePath||p.cachedImageUrl;return hash&&file?[{hash,file:'web/'+file}]:[]}));
 const registry=await readGzip(REGISTRY,{version:PREVIEW_QUALITY_VERSION,products:{}}),index=await readGzip(SOURCE_INDEX,{version:1,entries:{}}),work=[];
 for(const p of products){if(p.taxonomyAudit&&p.taxonomyAudit.disposition!=='include')continue;const prior=registry.products[p.sku],inputFingerprint=previewInput(p),unchangedSafe=prior?.status==='kept'&&!prior.compared&&previewProblems(quality.entries[p.displayImage?.sha256||p.imageCacheEvidence?.sha256]||{}).length===0;if((!nativeGalleryOnly||!prior?.selected||(p.originalImages||[]).some(g=>g.url===prior.selected.sourceUrl&&exactNativeGalleryMember(p,g)))&&prior?.version===PREVIEW_QUALITY_VERSION&&prior.inputFingerprint===inputFingerprint&&!['pending','pending-asset'].includes(prior.status)&&(prior.selectionVersion===SELECTION_VERSION||unchangedSafe||prior.status==='unavailable'))continue;
  const baseHash=p.displayImage?.sha256||p.imageCacheEvidence?.sha256,baseQuality=quality.entries[baseHash],issues=baseQuality?previewProblems(baseQuality):['unavailable'],pair=p.originalImages?.find(g=>g.url===p.originalImageUrl),mismatch=Boolean(!p.displayImage&&p.originalImageUrl&&![pair?.url,pair?.thumbnail].includes(p.imageCacheEvidence?.sourceUrl));
  const candidates=previewCandidates(p).filter(c=>!nativeGalleryOnly||(p.originalImages||[]).some(g=>g.url===c.url&&exactNativeGalleryMember(p,g))),lowNativeResolution=nativeGalleryOnly&&candidates.length>1&&Math.max(p.imageCacheEvidence?.width||0,p.imageCacheEvidence?.height||0)<1000,needs=!p.displayImage&&(issues.length>0||mismatch||lowNativeResolution);let chosen=candidates;
  if(candidates.length>maxCandidates&&!prioritySkus.includes(p.sku)){const positions=[0,1,2,candidates.length-1,Math.floor(candidates.length/2)];chosen=[...new Set(positions)].slice(0,maxCandidates).map(n=>candidates[n]);}
  if(!needs){registry.products[p.sku]={version:PREVIEW_QUALITY_VERSION,inputFingerprint,status:'kept',checkedAt:new Date().toISOString(),remainingIssues:issues};continue;}
  // Always include the currently displayed original so that comparisons are
  // made against the actual preview, not an unrelated listing thumbnail.
  if(p.originalImageUrl&&candidates.some(c=>c.url===p.originalImageUrl)&&!chosen.some(c=>c.url===p.originalImageUrl))chosen.push(candidates.find(c=>c.url===p.originalImageUrl));
  work.push({p,inputFingerprint,baseHash,baseQuality,issues,mismatch,candidates:chosen});
 }
 await fs.mkdir('web/images/previews',{recursive:true});const unresolvedUrls=new Set(work.filter(w=>!registry.products[w.p.sku]).flatMap(w=>w.candidates.map(c=>c.url))),candidateUrls=[...new Set(work.flatMap(w=>w.candidates.map(c=>c.url)))],available=new Set();
 for(const url of candidateUrls){const a=index.entries[url];if(!a?.hash||!quality.entries[a.hash]||!a.file)continue;try{if(a.file==='web/images/previews/'+a.hash+'.webp')await materializeCommittedImage(a.file.slice(4),a.hash);const b=await fs.readFile(a.file);if(createHash('sha256').update(b).digest('hex')===a.hash)available.add(url);}catch{}}
 const requests=candidateUrls.filter(url=>{const a=index.entries[url];return !available.has(url)&&![403,404].includes(a?.status)&&(a?.attempts||0)<2&&(!a?.checkedAt||unresolvedUrls.has(url)||a?.hash);});let fetched=0,batches=0,failed=0;
 if(reader)for(let offset=0;offset<requests.length&&batches<maxBatches;offset+=batchSize){const urls=requests.slice(offset,offset+batchSize);const results=await reader.previewAssets(urls,{maxSide:320});batches++;if(results.length!==urls.length||new Set(results.map(r=>r.url)).size!==urls.length||results.some(r=>!urls.includes(r.url)))throw Error('Preview asset batch did not reconcile');
  const attempted=results.filter(r=>!r.deferred),outage=batches===1&&attempted.length>0&&attempted.filter(r=>r.ok).length<attempted.length*.2&&!urls.every(url=>index.entries[url]?.checkedAt);
  for(const r of results){if(!r.ok){failed++;index.entries[r.url]={error:r.error||'HTTP '+r.status,status:r.status,attempts:(index.entries[r.url]?.attempts||0)+(r.deferred?0:1),checkedAt:r.deferred?undefined:new Date().toISOString()};continue;}const bytes=Buffer.from(r.dataBase64,'base64'),hash=createHash('sha256').update(bytes).digest('hex'),file='web/images/previews/'+hash+'.webp';await fs.mkdir('web/images/previews',{recursive:true});await fs.writeFile(file,bytes);const {dataBase64,...meta}=r;index.entries[r.url]={...meta,hash,file,checkedAt:new Date().toISOString()};fetched++;}
  if(outage){await writeGzip(SOURCE_INDEX,index);console.error(JSON.stringify({phase:'preview-source-channel-unavailable',attempted:attempted.length,successful:attempted.filter(r=>r.ok).length,examples:attempted.filter(r=>!r.ok).slice(0,3).map(({url,status,error})=>({url,status,error}))}));throw Error('Preview source channel failed; stopped before more paid batches');}
  await writeGzip(SOURCE_INDEX,index);console.log(JSON.stringify({phase:'preview-gallery-download',checked:Math.min(offset+batchSize,requests.length),total:requests.length,batches,fetched,failed}));
 }
 const downloaded=Object.values(index.entries).filter(r=>r.hash&&!quality.entries[r.hash]);const usable=[];for(const r of downloaded)try{await fs.access(r.file);usable.push({hash:r.hash,file:r.file});}catch{}
 await analysePreviewFiles(usable);const updatedQuality=await readPreviewQuality();await fs.mkdir('web/images/previews',{recursive:true});let changed=0,limited=0,pending=0;
 for(const w of work){const choices=w.candidates.map(c=>({candidate:c,asset:index.entries[c.url]})).filter(x=>x.asset?.hash&&updatedQuality.entries[x.asset.hash]).map(x=>({...x,quality:updatedQuality.entries[x.asset.hash]})).sort((a,b)=>previewQualityScore(b.quality)-previewQualityScore(a.quality));
  const resolutionBest=nativeGalleryOnly?choices.filter(c=>!previewProblems(c.quality).some(i=>['logo','diagram','detail','cropped'].includes(i))&&previewQualityScore(c.quality)>=previewQualityScore(choices[0]?.quality||{})-.12).sort((a,b)=>Math.max(b.asset.sourceWidth||0,b.asset.sourceHeight||0)-Math.max(a.asset.sourceWidth||0,a.asset.sourceHeight||0))[0]:null;
  const current=choices.find(c=>c.candidate.url===w.p.originalImageUrl),base=current?.quality||w.baseQuality,best=choices.find(c=>c.candidate.url===REVIEWED_WHOLE_SOURCES[w.p.sku])||resolutionBest||choices[0];
  if(!best){const exhausted=w.candidates.length&&w.candidates.every(c=>index.entries[c.url]?.checkedAt);if(exhausted||!w.candidates.length){registry.products[w.p.sku]={version:PREVIEW_QUALITY_VERSION,selectionVersion:SELECTION_VERSION,inputFingerprint:w.inputFingerprint,status:'unavailable',checkedAt:new Date().toISOString(),remainingIssues:['source-unavailable']};limited++;}else pending++;continue;}
  const bestIssues=previewProblems(best.quality),baseScore=base?previewQualityScore(base):-10,better=best.candidate.url!==w.p.originalImageUrl&&previewQualityScore(best.quality)>baseScore+.09,hasActualCurrent=Boolean(current),higherNativeResolution=nativeGalleryOnly&&current&&best.candidate.url!==current.candidate.url&&!bestIssues.some(i=>['logo','diagram','detail','cropped'].includes(i))&&Math.max(best.asset.sourceWidth||0,best.asset.sourceHeight||0)>Math.max(current.asset.sourceWidth||0,current.asset.sourceHeight||0)&&previewQualityScore(best.quality)>=baseScore-.12,use=better||higherNativeResolution||hasActualCurrent&&w.mismatch&&best.candidate.url===w.p.originalImageUrl;
  const r={version:PREVIEW_QUALITY_VERSION,selectionVersion:SELECTION_VERSION,inputFingerprint:w.inputFingerprint,status:bestIssues.some(i=>['logo','diagram','detail','cropped'].includes(i))?'limited':'kept',checkedAt:new Date().toISOString(),remainingIssues:bestIssues,compared:choices.length};
  if(use){const bytes=await fs.readFile(best.asset.file).catch(()=>null),cachePath='images/previews/'+best.asset.hash+'.webp';if(bytes){await fs.mkdir('web/images/previews',{recursive:true});await fs.writeFile('web/'+cachePath,bytes);}r.selected={selectedSku:w.p.sku,sourceUrl:best.candidate.url,sourceProductUrl:w.p.sourceUrl,cachePath:bytes?cachePath:null,sha256:best.asset.hash,width:bytes?best.asset.width:0,height:bytes?best.asset.height:0,originalWidth:best.asset.sourceWidth,originalHeight:best.asset.sourceHeight,originalSha256:best.asset.sourceHash,method:'same-SKU-gallery-whole-product-selection',verifiedAt:r.checkedAt};r.status=bytes?(bestIssues.some(i=>['logo','diagram','detail','cropped'].includes(i))?'limited':'selected'):'pending-asset';changed++;}
  if(r.status==='limited')limited++;registry.products[w.p.sku]=r;
 }
 const upgrades=[...new Set(Object.values(registry.products).filter(r=>r.selected&&!r.upgradeAttemptedAt&&Math.max(r.selected.width,r.selected.height)<Math.min(600,Math.max(r.selected.originalWidth,r.selected.originalHeight))).map(r=>r.selected.sourceUrl))];
 if(reader)for(let offset=0;offset<upgrades.length&&batches<maxBatches;offset+=100){const urls=upgrades.slice(offset,offset+100),results=await reader.previewAssets(urls,{maxSide:600});batches++;for(const asset of results){for(const r of Object.values(registry.products).filter(r=>r.selected?.sourceUrl===asset.url))r.upgradeAttemptedAt=new Date().toISOString();if(!asset.ok)continue;const bytes=Buffer.from(asset.dataBase64,'base64'),hash=createHash('sha256').update(bytes).digest('hex'),cachePath='images/previews/'+hash+'.webp',prior=index.entries[asset.url];await fs.mkdir('web/images/previews',{recursive:true});await fs.writeFile('web/'+cachePath,bytes);if(prior?.hash&&updatedQuality.entries[prior.hash])updatedQuality.entries[hash]=updatedQuality.entries[prior.hash];const {dataBase64,...meta}=asset;index.entries[asset.url]={...meta,hash,file:'web/'+cachePath,checkedAt:new Date().toISOString()};for(const r of Object.values(registry.products).filter(r=>r.selected?.sourceUrl===asset.url))Object.assign(r.selected,{cachePath,sha256:hash,width:asset.width,height:asset.height,originalWidth:asset.sourceWidth,originalHeight:asset.sourceHeight,originalSha256:asset.sourceHash});}console.log(JSON.stringify({phase:'preview-resolution-upgrade',checked:Math.min(offset+100,upgrades.length),total:upgrades.length,batches}));}
 for(const r of Object.values(registry.products))if(r.selected?.cachePath&&r.status==='pending-asset')r.status='selected';else if(r.status==='pending-asset')pending++;
 const retained=new Set([...Object.values(registry.products).map(r=>r.selected?.cachePath),...Object.values(index.entries).map(r=>r.file?.startsWith('web/images/previews/')?r.file.slice(4):null)].filter(Boolean));for(const file of await fs.readdir('web/images/previews'))if(!retained.has('images/previews/'+file))await fs.unlink('web/images/previews/'+file);
 await savePreviewQuality(updatedQuality);await writeGzip(SOURCE_INDEX,index);await writeGzip(REGISTRY,registry);const status={version:PREVIEW_QUALITY_VERSION,revision:digest(registry),checkedAt:new Date().toISOString(),products:products.length,registered:Object.keys(registry.products).length,changed,limited,pending,sourceRequestsMade:batches>0,batches,fetched,failed,categoryOrArrivalHistoryChanged:false};await fs.writeFile('web/preview-status.json',JSON.stringify(status));console.log(JSON.stringify({phase:'whole-product-previews',...status}));return status;
}

// Normal updates reuse every unchanged proof. Only new/changed SKU galleries
// share the already-authorised collection reader. An unrestricted owner grant
// removes the legacy two-batch ceiling while retaining the outage circuit;
// this helper never opens a separate paid session or retries a whole catalogue.
export async function optimiseChangedProductPreviews(products,reader){
 if(!reader?.previewAssets)return {changed:0,sourceRequestsMade:false};
 const registry=await readGzip(REGISTRY,null);if(!registry||registry.version!==PREVIEW_QUALITY_VERSION)return {changed:0,initialAuditPending:true,sourceRequestsMade:false};
 const unique=[...new Map(products.map(p=>[p.sku,p])).values()],changed=unique.filter(p=>p.imageCacheEvidence?.sha256&&(!registry.products[p.sku]||registry.products[p.sku].inputFingerprint!==previewInput(p)));
 if(!changed.length)return {changed:0,sourceRequestsMade:false};
 const previous=await fs.readFile('web/preview-status.json','utf8').then(JSON.parse).catch(()=>({}));
 const maxBatches=unrestrictedCollection(await loadPolicy())?Infinity:2;
 try{const result=await optimiseProductPreviews(changed,{reader,maxBatches,batchSize:160,maxCandidates:3});await fs.writeFile('web/preview-status.json',JSON.stringify({...previous,revision:result.revision,registered:result.registered,lastIncremental:result}));return result;}
 catch(error){const result={changed:changed.length,error:String(error.message).slice(0,200),checkedAt:new Date().toISOString(),boundedBatches:Number.isFinite(maxBatches)?maxBatches:null};await fs.writeFile('web/preview-status.json',JSON.stringify({...previous,lastIncremental:result}));console.error(JSON.stringify({phase:'incremental-preview-bounded-stop',...result}));return result;}
}
