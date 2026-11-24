import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Recover the exact successful source observation from its own Actions archive.
// Billing and other retailers are deliberately outside this restoration scope.
export async function restoreSavedMsEvidence({archiveRoot,webRoot='web',sourceRun='45496725601'}={}){
 if(sourceRun!=='45496725601')throw Error('Only the identified M&S source archive is approved');
 const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),archive=path.resolve(archiveRoot),root=path.resolve(webRoot),saved=await read(path.join(archive,'ms/catalogue.json'));
 const date=Date.parse(saved.observedAt);if(saved.retailerId!=='ms'||!saved.baselineReady||!Number.isFinite(date)||!Array.isArray(saved.products)||!saved.products.length||new Set(saved.products.map(p=>String(p.sku))).size!==saved.products.length||saved.imageAudit?.verified!==saved.products.length||saved.imageAudit?.failed!==0||saved.sourceUnavailableFamilies?.length)throw Error('Archived M&S source observation is incomplete');
 let current;try{current=await read(path.join(root,'ms/catalogue.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(current&&Date.parse(current.observedAt)>date)return{sourceRun,restored:false,newerCommittedObservationPreserved:true,sourceRequests:0,firecrawlCredits:0};
 const index=await read(path.join(archive,'ms/image-index.json')),imageFiles=new Map();
 for(const item of await fs.readdir(path.join(archive,'images/ms'),{withFileTypes:true})){
  if(!item.isFile()||!/^([a-f0-9]{64})\.(?:jpg|jpeg|png|webp)$/.test(item.name))throw Error('Unexpected file in saved M&S native images');
  const relative='images/ms/'+item.name,bytes=await fs.readFile(path.join(archive,relative)),hash=createHash('sha256').update(bytes).digest('hex');if(hash!==item.name.split('.')[0])throw Error('Saved M&S native body digest changed');imageFiles.set(relative,{bytes,hash});
 }
 for(const p of saved.products){
  const u=new URL(p.sourceUrl);if(p.retailerId!=='ms'||!/(^|\.)marksandspencer\.com$/.test(u.hostname)||!p.detailsReady)throw Error('Archived product has the wrong official M&S identity');
  const image=p.originalCachedImageUrl||p.cachedImageUrl,e=p.originalImageEvidence||p.imageCacheEvidence,r=imageFiles.get(image),entry=index[e?.sourceUrl];if(!r||e?.sha256!==r.hash||entry?.hash!==r.hash||entry.file!==image)throw Error('Saved exact M&S product has no matching native image body');
 }
 const dataFiles=[];for(const item of await fs.readdir(path.join(archive,'ms'),{withFileTypes:true})){if(!item.isFile()||!/^[-a-z0-9]+\.json$/.test(item.name))throw Error('Unexpected saved M&S catalogue file');const bytes=await fs.readFile(path.join(archive,'ms',item.name));JSON.parse(bytes.toString('utf8'));dataFiles.push([item.name,bytes]);}
 // Validate the complete archive before making any catalogue or image changes.
 await fs.mkdir(path.join(root,'images/ms'),{recursive:true});await fs.mkdir(path.join(root,'ms'),{recursive:true});for(const[relative,{bytes}]of imageFiles)await fs.writeFile(path.join(root,relative),bytes);for(const[name,bytes]of dataFiles)await fs.writeFile(path.join(root,'ms',name),bytes);
 const report={sourceRun,restored:true,products:saved.products.length,originalFiles:imageFiles.size,sourceObservedAt:saved.observedAt,sourceRequests:0,firecrawlCredits:0,sourceFactsAndNativeBytesUnchanged:true,sharedBillingUntouched:true};await fs.writeFile(path.join(root,'ms/evidence-restoration.json'),JSON.stringify(report));return report;
}
