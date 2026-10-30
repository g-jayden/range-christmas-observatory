import fs from 'node:fs/promises';
await fs.mkdir('public',{recursive:true});
for(const name of ['index.html','dashboard-full.css','dashboard-full.js','catalogue.json','status.json','image-check.html','image-check.js'])await fs.copyFile('web/'+name,'public/'+name);
try{await fs.cp('web/images','public/images',{recursive:true})}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile('public/.nojekyll','');console.log('Static cloud website built.');
