import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export async function readBqFreeRecovery(sourceObservedAt,{root='web/bq',readFile=fs.readFile}={}){
 const request=await readFile(root+'/free-variant-recovery-request.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(request?.version===1&&request.sourceObservedAt===sourceObservedAt){
  if(request.scope!=='saved-exact-variant-evidence-only'||request.catalogueDirectoryRequests!==0||request.firecrawlCredits!==0||!Array.isArray(request.parts)||!request.parts.length||request.parts.length>16||request.parts.some(p=>!/^free-variant-recovery-\d{8}-part-\d+\.b64$/.test(p))||new Set(request.parts).size!==request.parts.length)throw Error('Invalid B&Q saved free-recovery scope');
  const text=(await Promise.all(request.parts.map(p=>readFile(root+'/'+p,'utf8')))).join('').trim();
  if(text.length>12000000||!/^[-A-Za-z0-9+/=\r\n]+$/.test(text))throw Error('Invalid B&Q saved recovery encoding');
  const bytes=Buffer.from(text,'base64');
  if(createHash('sha256').update(bytes).digest('hex')!==request.compressedSha256)throw Error('B&Q saved recovery payload changed');
  const recovery=JSON.parse(gunzipSync(bytes,{maxOutputLength:64000000}));
  if(recovery.sourceObservedAt!==sourceObservedAt||recovery.firecrawlCredits!==0||recovery.paidRequests!==0||recovery.catalogueDirectoryRequests!==0||recovery.method!=='ordinary-official-public-HTTP-no-provider')throw Error('B&Q saved recovery source or billing mismatch');
  return recovery;
 }
 return readFile(root+'/free-variant-recovery.json.gz').then(b=>JSON.parse(gunzipSync(b))).then(r=>r.sourceObservedAt===sourceObservedAt?r:null).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
}
