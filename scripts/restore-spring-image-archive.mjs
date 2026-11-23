import fs from'node:fs/promises';import{restoreSourceImageArchive}from'../server/source-image-archive.mjs';
const read=file=>fs.readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return{};}),[source,checkpoint]=await Promise.all(['web/spring/source.json','web/spring/image-checkpoint.json'].map(read)),records=[];
for(const entry of Object.values({...source.imageAudit?.entries,...checkpoint.entries}))if(entry?.cachedImageUrl&&entry.hash)records.push({file:entry.cachedImageUrl,sha256:entry.hash});
for(const p of source.products||[]){if(p.originalCachedImageUrl&&p.originalImageEvidence?.sha256)records.push({file:p.originalCachedImageUrl,sha256:p.originalImageEvidence.sha256});if(p.previewImage?.cachePath&&p.previewImage.sha256)records.push({file:p.previewImage.cachePath,sha256:p.previewImage.sha256});}
console.log(JSON.stringify({phase:'restore-spring-source-archive-free',...await restoreSourceImageArchive(records)}));
