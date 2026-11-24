import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

// A resumed morning observation retains its original timestamps. Independent
// closing reads still go to the source and validate counts, membership and offers.
export function rangeDirectoryWindowStart(at){
 const t=Number(at),local=t+8*3600000,day=Math.floor(local/86400000)*86400000;
 return day-8*3600000+(local-day>=6*3600000?6*3600000:0);
}
const hash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
function officialUrl(raw){try{const u=new URL(raw);return u.origin==='https://search-lon.therange.co.uk'&&u.pathname==='/api/productlist'&&!u.username&&!u.password&&!u.hash?u.href:null;}catch{return null;}}
export async function createRangeDirectoryCheckpoint({file,validate,now=()=>Date.now(),maxAgeMs=3*3600000}={}){
 if(!file||typeof validate!=='function')throw Error('Explicit catalogue checkpoint and source validator required');
 let saved;try{saved=JSON.parse(gunzipSync(await fs.readFile(file)));}catch(e){if(e.code!=='ENOENT')console.error(JSON.stringify({phase:'discard-invalid-directory-checkpoint',reason:String(e.message).slice(0,120)}));}
 const entries=new Map(),used=new Map();let writes=Promise.resolve();
 const valid=row=>{try{const at=Date.parse(row.observedAt),t=now();if(row.status!==200||!officialUrl(row.url)||!Number.isFinite(at)||at>t+1000||at<rangeDirectoryWindowStart(t)||t-at>maxAgeMs||row.sha256!==hash(row.body))return false;validate(row.body);return true;}catch{return false;}};
 if(saved?.version===1)for(const row of saved.pages||[])if(valid(row))entries.set(row.url,row);
 return {
  read(url,{fresh=false}={}){if(fresh)return null;const row=entries.get(url);if(!row||!valid(row)){entries.delete(url);return null;}used.set(url,row.observedAt);return structuredClone({...row,source:'saved-current-source-observation',checkpointReused:true});},
  async retain(rows){let changed=false;for(const row of rows){try{if(row.status!==200||!officialUrl(row.url))continue;validate(row.body);const entry={url:row.url,status:200,body:row.body,observedAt:row.observedAt,sha256:hash(row.body),source:row.source||'official-directory-response'};if(!valid(entry))continue;entries.set(entry.url,entry);used.set(entry.url,entry.observedAt);changed=true;}catch{}}
   if(!changed)return;const write=async()=>{for(const[url,row]of entries)if(!valid(row))entries.delete(url);const bytes=gzipSync(JSON.stringify({version:1,pages:[...entries.values()]})),temp=file+'.'+randomUUID()+'.next';await fs.mkdir(path.dirname(file),{recursive:true});try{await fs.writeFile(temp,bytes);await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}};writes=writes.then(write);await writes;
  },
  summary(){const stamps=[...used.values()].sort();return {retainedPages:entries.size,observationStartedAt:stamps[0]||null,observationEndedAt:stamps.at(-1)||null,originalTimestampsPreserved:true};}
 };
}
