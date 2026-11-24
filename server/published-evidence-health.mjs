import fs from 'node:fs/promises';
import path from 'node:path';
import {productEvidenceHealth} from './product-evidence-health.mjs';
import {mergeReportProduct} from './report-product-evidence.mjs';
import {bestVerifiedEvidence} from './verified-evidence.mjs';
import {publishedGalleryCoverage} from './published-gallery-coverage.mjs';
// Audit what users actually receive after native mirrors have been applied to
// compact cards and lazy detail shards, without changing any source record.
export async function publishedEvidenceHealth(root){
 const unavailableSourceScopes=[];
 const cache=new Map(),read=async name=>{if(!cache.has(name))cache.set(name,fs.readFile(path.join(root,name),'utf8').then(JSON.parse));return cache.get(name);};
 const snapshots=await Promise.all(['catalogue','decorations','lights','themes'].map(async name=>{
  const source=await read(name+'.json');if(!Array.isArray(source.products)){unavailableSourceScopes.push(name);return null;}
  const products=await Promise.all(source.products.map(async p=>{
   if(!p.detailsUrl)return p;
   if(!/^(?:decoration|light|theme)-details\/[a-f0-9]{2}\.json$/.test(p.detailsUrl))throw Error('Unverified published detail shard');
   const full=(await read(p.detailsUrl))[p.sku];
   if(!full||full.sourceUrl!==p.sourceUrl||!bestVerifiedEvidence(p,[full]))return p;
   return mergeReportProduct(p,full);
  }));return{...source,products};
 }));
 let spring;try{spring=await read('spring/catalogue.json');}catch(e){if(e.code!=='ENOENT')throw e;}
 return{...productEvidenceHealth(snapshots),galleryNativeCoverage:publishedGalleryCoverage([...snapshots.filter(Boolean).flatMap(s=>s.products),...(spring?.products||[])]),evidenceStage:'published-exact-SKU-native-mirrors',hasCompleteSourceSnapshots:!unavailableSourceScopes.length,unavailableSourceScopes};
}
