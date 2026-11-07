import fs from 'node:fs/promises';
import path from 'node:path';

// Publish all referenced native files without copying historical cache versions
// or private capture checkpoints. The repository keeps those resumable proofs.
export async function copyPublishedAssets(source='web',destination='public'){
 const images=new Set();
 function visit(value){
  if(typeof value==='string'&&/^images\/[\w./-]+$/.test(value)&&!value.split('/').includes('..'))images.add(value);
  else if(Array.isArray(value))for(const v of value)visit(v);
  else if(value&&typeof value==='object')for(const v of Object.values(value))visit(v);
 }
 async function scan(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await scan(file);else if(item.name.endsWith('.json'))visit(JSON.parse(await fs.readFile(file,'utf8')));}}
 await scan(destination);
 let imageBytes=0,mailBytes=0,mailFiles=0,repositoryNotificationFiles=0,repositoryNotificationBytes=0;
 for(const relative of images){const input=path.join(source,relative),output=path.join(destination,relative);await fs.mkdir(path.dirname(output),{recursive:true});await fs.copyFile(input,output);imageBytes+=(await fs.stat(input)).size;}
 const mailRoot=path.join(source,'mail-assets');
 for(const dir of await fs.readdir(mailRoot,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return[];throw e;})){
  if(!dir.isDirectory()||!/^\d+$/.test(dir.name))continue;
  const input=path.join(mailRoot,dir.name),manifest=await fs.readFile(path.join(input,'manifest.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(!manifest)continue;
  if(String(manifest.sku)!==dir.name)throw Error('Mail manifest SKU mismatch: '+dir.name);
  const files=new Set();
  for(const name of ['card','original','mailOriginal','proof','notification'])if(manifest[name]?.url){const url=new URL(manifest[name].url);const prefix='/range-christmas-observatory/mail-assets/'+dir.name+'/';if(url.origin==='https://raw.githubusercontent.com'&&url.pathname.startsWith('/g-jayden/range-christmas-observatory/main/web/mail-assets/'+dir.name+'/'))continue;if(url.origin!=='https://g-jayden.github.io'||!url.pathname.startsWith(prefix))throw Error('Unexpected published mail asset');const file=url.pathname.slice(prefix.length);if(!/^[\w.-]+$/.test(file))throw Error('Invalid mail filename');if(name==='notification'){repositoryNotificationBytes+=(await fs.stat(path.join(input,file))).size;repositoryNotificationFiles++;manifest.notification={...manifest.notification,url:'https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/mail-assets/'+dir.name+'/'+file};continue;}files.add(file);}
  const output=path.join(destination,'mail-assets',dir.name);await fs.mkdir(output,{recursive:true});
  const publishedManifest=JSON.stringify(manifest);await fs.writeFile(path.join(output,'manifest.json'),publishedManifest);mailBytes+=Buffer.byteLength(publishedManifest);mailFiles++;
  for(const file of files){await fs.copyFile(path.join(input,file),path.join(output,file));mailBytes+=(await fs.stat(path.join(input,file))).size;mailFiles++;}
 }
 const report={images:images.size,imageBytes,mailFiles,mailBytes,repositoryNotificationFiles,repositoryNotificationBytes,originalFilesRecompressed:false,sourceRequests:0,firecrawlCredits:0};console.log(JSON.stringify({phase:'publish-referenced-assets',...report}));return report;
}
