import{validProductImage}from'./details.mjs';
import fs from'node:fs/promises';import{createHash}from'node:crypto';
// A sparse-checkout rebase can remove an unchanged archive file from disk.
// Restore exact already-committed bytes before the local image classifier;
// metadata alone is never sufficient and this path cannot contact a retailer.
export async function hydrateRangePreviewEntries(entries,{readFile=fs.readFile,writeFile=fs.writeFile,fetcher=fetch,revision='main'}={}){
 if(revision!=='main'&&!/^[a-f0-9]{40}$/.test(revision))throw Error('Unexpected archive revision');
 let restored=0,verified=0;const unavailable=[];
 for(const[url,e]of Object.entries(entries))try{
  if(!e.ok||!/^[a-f0-9]{64}$/.test(e.hash||'')||!new RegExp('^images/source/'+e.hash+'\\.(jpg|png|webp|avif|gif)$').test(e.cachedImageUrl||''))throw Error('Exact hash-bound preview archive required');
  let b;try{b=await readFile('web/'+e.cachedImageUrl);}catch(error){if(error.code!=='ENOENT')throw error;const r=await fetcher('https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/'+revision+'/web/'+e.cachedImageUrl,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Preview archive HTTP '+r.status);b=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(b).digest('hex')!==e.hash)throw Error('Preview archive digest mismatch');await writeFile('web/'+e.cachedImageUrl,b);restored++;}
  if(createHash('sha256').update(b).digest('hex')!==e.hash)throw Error('Preview archive digest mismatch');verified++;
 }catch(error){unavailable.push({url,error:String(error.message)});}
 return{restored,verified,unavailable,sourceRequests:0,firecrawlCredits:0};
}
export function rangeMissingPreviewTargets(snapshots){const out=new Map;for(const s of snapshots)for(const p of s.products||[]){if(p.taxonomyAudit?.disposition!=='include')continue;const url=p.variantImageUrl||p.imageUrl;let u;try{u=new URL(url)}catch{}if(!u||!['www.therange.co.uk','kube-media-unpublished.rstore.com'].includes(u.hostname)||!validProductImage(url))continue;if(p.cachedImageUrl&&p.imageCacheEvidence?.sha256&&p.imageCacheEvidence.sourceUrl===url)continue;const old=out.get(url);if(old){if(!old.skus.includes(p.sku))old.skus.push(p.sku);}else out.set(url,{sku:p.sku,skus:[p.sku],sourceUrl:p.sourceUrl,variantImageUrl:url});}return out;}
export function applyRangePreviewEntries(snapshots,entries){let applied=0;const changed=new Map;for(const s of snapshots)for(const p of s.products||[]){const url=p.variantImageUrl||p.imageUrl,e=entries[url];if(p.taxonomyAudit?.disposition!=='include'||!e?.ok||!e.skus?.includes(p.sku)||!new RegExp('^images/source/'+e.hash+'\\.(?:jpg|png|webp|avif|gif)$').test(e.cachedImageUrl||'')||!/^[a-f0-9]{64}$/.test(e.hash||'')||e.width<64||e.height<64)continue;if(p.cachedImageUrl===e.cachedImageUrl&&p.imageCacheEvidence?.sha256===e.hash&&p.imageCacheEvidence.sourceUrl===url)continue;p.cachedImageUrl=e.cachedImageUrl;p.imageCacheEvidence={sourceUrl:url,sha256:e.hash,observedAt:e.observedAt,representation:'official-current-listing-preview-bytes'};p.imageRecoveryEvidence={sourceUrl:url,sourceBytesUnchanged:true,method:'exact-current-listing-SKU-bound-photo',observedAt:e.observedAt};delete p.imageIssue;changed.set(p.sku,p);applied++;}return{applied,changed:[...changed.values()]};}
