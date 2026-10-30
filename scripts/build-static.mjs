import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
await fs.mkdir('public',{recursive:true});
for(const name of ['index.html','dashboard-full.css','dashboard-full.js','catalogue.json','status.json','image-check.html','image-check.js','controls.js','settings.json','service.json'])await fs.copyFile('web/'+name,'public/'+name);
for(const page of ['index.html','image-check.html']){
 let html=await fs.readFile('public/'+page,'utf8');
 for(const asset of ['dashboard-full.css','dashboard-full.js','controls.js','image-check.js']){
  const hash=createHash('sha256').update(await fs.readFile('web/'+asset)).digest('hex').slice(0,12);html=html.replaceAll('"'+asset+'"','"'+asset+'?v='+hash+'"');
 }
 await fs.writeFile('public/'+page,html);
}
try{await fs.cp('web/images','public/images',{recursive:true})}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile('public/.nojekyll','');console.log('Static cloud website built.');
