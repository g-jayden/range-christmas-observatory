import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
// Sparse report checkouts fetch only the few native photos needed by explicit
// human reviews. Every response must retain the previously committed digest.
export async function restoreReviewedNativeFiles(overrides,{root='web',readFile=fs.readFile,writeFile=fs.writeFile,mkdir=fs.mkdir,fetcher=fetch}={}){
 let restored=0;for(const review of Object.values(overrides?.products||{})){
  const d=review.displayImage;if(!d?.cachePath)continue;
  let bytes;try{bytes=await readFile(path.join(root,d.cachePath));}catch(e){
   if(e.code!=='ENOENT'||!/^images\/source\/[a-f0-9]{64}\.(?:jpg|png|webp|avif|gif)$/.test(d.cachePath)||!d.cachePath.includes(d.sha256+'.'))throw e;
   const r=await fetcher('https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/'+d.cachePath,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Committed reviewed original unavailable HTTP '+r.status);bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>25000000)throw Error('Reviewed original too large');
   if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('Reviewed original digest mismatch');await mkdir(path.dirname(path.join(root,d.cachePath)),{recursive:true});await writeFile(path.join(root,d.cachePath),bytes);restored++;
  }
  if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('Reviewed original digest mismatch');
 }
 return {restored,sourceRequests:0,firecrawlCredits:0};
}
