import fs from'node:fs/promises';import{restoreSpringImageArchive}from'../server/spring-image-archive.mjs';import{atomicJson}from'../server/sync.mjs';
const read=file=>fs.readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return{};}),[source,checkpoint]=await Promise.all(['web/spring/source.json','web/spring/image-checkpoint.json'].map(read)),result=await restoreSpringImageArchive(source,checkpoint);
if(source.products)await atomicJson('web/spring/source.json',source);console.log(JSON.stringify({phase:'restore-spring-source-archive-free',...result}));
