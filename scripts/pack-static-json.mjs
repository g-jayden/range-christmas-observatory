import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
const hash=b=>createHash('sha256').update(b).digest('hex');
// Pages limits the published file payload to 1 GB. Tar headers and padding
// belong to the upload container, so verify both sizes independently instead
// of rejecting a valid payload merely because it contains many small files.
export async function packStaticJson(root='public',{triggerBytes=900000000,minBytes=4096,maxPublishedBytes=990000000,maxTarBytes=1000000000}={}){
 const files=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())await walk(full);else if(e.isFile()){const s=await fs.stat(full);files.push({path:path.relative(root,full).split(path.sep).join('/'),bytes:s.size});}}}await walk(root);
 const beforeBytes=files.reduce((n,f)=>n+f.bytes,0),tarBytes=list=>list.reduce((n,f)=>n+512+Math.ceil(f.bytes/512)*512,10240);
 if(beforeBytes<triggerBytes)return{enabled:false,beforeBytes,afterBytes:beforeBytes,estimatedTarBytes:tarBytes(files),sourceRequests:0,firecrawlCredits:0};
 const index={version:'lossless-static-json-v1',files:{}},replaced=new Map();let originalJsonBytes=0,compressedJsonBytes=0;
 for(const f of files){if(!f.path.endsWith('.json')||f.path==='static-json-index.json'||f.bytes<minBytes)continue;const input=await fs.readFile(path.join(root,f.path)),sha256=hash(input),packed=gzipSync(input,{level:9});if(packed.length>=input.length*.9)continue;if(!gunzipSync(packed).equals(input))throw Error('Lossless catalogue round-trip failed: '+f.path);const url=f.path+'.'+sha256.slice(0,20)+'.gz';await fs.writeFile(path.join(root,url),packed);index.files[f.path]={url,sha256,bytes:input.length};replaced.set(f.path,{path:url,bytes:packed.length});originalJsonBytes+=input.length;compressedJsonBytes+=packed.length;}
 const script=await fs.readFile(new URL('../web/static-json-transport.js',import.meta.url)),scriptName='static-json-transport.js',scriptHash=hash(script).slice(0,20);await fs.writeFile(path.join(root,scriptName),script);
 const htmlChanges=[];for(const name of ['index.html','product.html','confirm.html','image-check.html']){const full=path.join(root,name);let text;try{text=await fs.readFile(full,'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}const tag='<script src="'+scriptName+'?v='+scriptHash+'"></script>';text=/<head\b[^>]*>/i.test(text)?text.replace(/<head\b[^>]*>/i,m=>m+'\n'+tag):text.replace(/^(\s*<!doctype[^>]*>)?/i,m=>m+'\n'+tag);await fs.writeFile(full,text);htmlChanges.push({path:name,bytes:Buffer.byteLength(text)});}
 const serialized=JSON.stringify(index);await fs.writeFile(path.join(root,'static-json-index.json'),serialized);
 const htmlBy=new Map(htmlChanges.map(f=>[f.path,f])),after=files.map(f=>replaced.get(f.path)||htmlBy.get(f.path)||f);after.push({path:scriptName,bytes:script.length},{path:'static-json-index.json',bytes:Buffer.byteLength(serialized)});const estimate=tarBytes(after),afterBytes=after.reduce((n,f)=>n+f.bytes,0);if(afterBytes>maxPublishedBytes||estimate>maxTarBytes){const directories={};for(const f of after){const name=f.path.split('/')[0];directories[name]=(directories[name]||0)+f.bytes;}throw Error('Packed site exceeds its verified file or upload budget: '+JSON.stringify({publishedBytes:afterBytes,maxPublishedBytes,estimatedTarBytes:estimate,maxTarBytes,largestDirectories:Object.entries(directories).sort((a,b)=>b[1]-a[1]).slice(0,8)}));}
 // Remove a large public JSON only after its exact gzip copy, client loader,
 // integrity map and final size check have all succeeded. Repository inputs,
 // product pictures, report files and image URLs are never modified.
 for(const name of replaced.keys())await fs.unlink(path.join(root,name));
 return{enabled:true,beforeBytes,afterBytes,estimatedTarBytes:estimate,publishedByteBudget:maxPublishedBytes,uploadByteBudget:maxTarBytes,compressedFiles:replaced.size,originalJsonBytes,compressedJsonBytes,sourceImagesChanged:0,sourceRequests:0,firecrawlCredits:0};
}
