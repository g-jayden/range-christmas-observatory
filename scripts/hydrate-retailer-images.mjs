import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {atomicJson} from '../server/sync.mjs';

// Runs inside the existing publisher with its existing permissions. Source probes
// stay read-only. The requested catalogue digest fixes the exact reviewed data.
const requestFile='web/retailer-release.json';
const request=await fs.readFile(requestFile,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(!request||request.state!=='pending'){console.log('No reviewed retailer release pending.');process.exit(0);}
if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.COLLECTION_MODE!=='publish'){
 console.log('Reviewed release waits for explicit publication; no source collection.');process.exit(0);
}
const retailerId=request.retailerId;
if(!['nx','jl'].includes(retailerId)||!/^[a-f0-9]{64}$/.test(request.catalogueSha256))throw Error('Invalid reviewed retailer release');
const packed=await fs.readFile('web/'+retailerId+'/release-payload.b64','utf8');
if(createHash('sha256').update(packed).digest('hex')!==request.payloadSha256)throw Error('Reviewed release payload changed');
const files=JSON.parse(gunzipSync(Buffer.from(packed,'base64'),{maxOutputLength:32000000}));
const allowed=new Set(['catalogue.json','status.json','reviews.json','source-directory.json','native-products-status.json','image-path-config.json','visual-cache.json','image-index.json',...(retailerId==='jl'?['source-evidence.json','closing-directory.json']:[])]);
if(Object.keys(files).some(f=>!allowed.has(f))||!files['catalogue.json'])throw Error('Unexpected reviewed release file');
for(const [f,body]of Object.entries(files)){JSON.parse(body);await fs.writeFile('web/'+retailerId+'/'+f,body);}
const bytes=await fs.readFile('web/'+retailerId+'/catalogue.json');
if(createHash('sha256').update(bytes).digest('hex')!==request.catalogueSha256)throw Error('Reviewed catalogue changed; release refused');
const snapshot=JSON.parse(bytes);
if(!snapshot.baselineReady||snapshot.imageAudit?.verified!==snapshot.products.length)throw Error('Complete reviewed catalogue and source images required');
const jobs=new Map();
for(const p of snapshot.products){
 if(p.imageIssue||!p.detailsReady||!p.visualEvidence)throw Error('Unverified source SKU in reviewed release');
 const e=p.originalImageEvidence,u=new URL(e?.sourceUrl||''),file=p.originalCachedImageUrl;
 const origin=retailerId==='nx'?'https://xcdn.next.co.uk':'https://media.johnlewiscontent.com';
 if(u.origin!==origin||!new RegExp('^images/'+retailerId+'/[a-f0-9]{64}\\.(?:jpg|png|webp|avif|gif)$').test(file||'')||!p.originalImages?.some(g=>g.url===u.href&&g.selectedSku===p.sku&&g.sourceParentId===p.parentGroupId)||!file.includes(e.sha256))throw Error('Native source identity mismatch');
 if(p.cachedImageUrl!==file)throw Error('Preview must have the reviewed native-byte proof');
 jobs.set(file,{file,url:u.href,hash:e.sha256});
}
let cursor=0,received=0;const work=[...jobs.values()];
await Promise.all(Array.from({length:6},async()=>{while(cursor<work.length){const j=work[cursor++];let cached;try{cached=await fs.readFile('web/'+j.file);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(cached&&createHash('sha256').update(cached).digest('hex')===j.hash){received++;continue;}
 const r=await fetch(j.url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Native image unavailable HTTP '+r.status);
 const b=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(b).digest('hex')!==j.hash)throw Error('Official image changed after review; a new image review is required');
 await fs.mkdir(path.dirname('web/'+j.file),{recursive:true});await fs.writeFile('web/'+j.file,b);received++;if(received%50===0)console.log(JSON.stringify({phase:'hydrate-reviewed-native-images',received,total:work.length,firecrawlCredits:0}));
}}));
const file='web/retailer-activation.mjs',activation=await fs.readFile(file,'utf8');
if(!activation.includes(retailerId+':false'))throw Error('Initial release must begin with the retailer inactive');
await fs.writeFile(file,activation.replace(retailerId+':false',retailerId+':true'));
await atomicJson(requestFile,{...request,state:'complete',completedAt:new Date().toISOString(),nativeImages:received,firecrawlCredits:0});
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,retailerId+'=true\n');
console.log(JSON.stringify({phase:'reviewed-retailer-release-accepted',retailerId,nativeImages:received,skus:snapshot.products.length,firecrawlCredits:0}));
