import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
await fs.mkdir('public',{recursive:true});
for(const name of ['catalogue.json','status.json','settings.json','service.json','collection-policy.json','collection-ledger.json','monitor-state.json','new-arrivals.json','monitor-proof.json'])JSON.parse(await fs.readFile('web/'+name,'utf8'));
for(const name of ['index.html','dashboard-full.css','dashboard-full.js','catalogue.json','status.json','image-check.html','image-check.js','controls.js','settings.json','service.json','collection-policy.json','collection-ledger.json','monitor-state.json','new-arrivals.json','monitor-proof.json','confirm.html','product.html','catalogue-model.mjs'])await fs.copyFile('web/'+name,'public/'+name);
const modelHash=createHash('sha256').update(await fs.readFile('web/catalogue-model.mjs')).digest('hex').slice(0,12);
for(const file of ['dashboard-full.js','controls.js']){const text=await fs.readFile('public/'+file,'utf8');await fs.writeFile('public/'+file,text.replaceAll("'./catalogue-model.mjs'","'./catalogue-model.mjs?v="+modelHash+"'"));}
for(const page of ['index.html','image-check.html']){
 let html=await fs.readFile('public/'+page,'utf8');
 for(const asset of ['dashboard-full.css','dashboard-full.js','controls.js','image-check.js']){
  const hash=createHash('sha256').update(await fs.readFile('public/'+asset)).digest('hex').slice(0,12);html=html.replaceAll('"'+asset+'"','"'+asset+'?v='+hash+'"');
 }
 await fs.writeFile('public/'+page,html);
}
try{await fs.cp('web/images','public/images',{recursive:true})}catch(e){if(e.code!=='ENOENT')throw e;}
try{await fs.cp('web/mail-assets','public/mail-assets',{recursive:true})}catch(e){if(e.code!=='ENOENT')throw e;}
for(const name of ['decorations.json','decorations-status.json','decoration-details'])try{const source='web/'+name;const st=await fs.stat(source);if(st.isDirectory())await fs.cp(source,'public/'+name,{recursive:true});else await fs.copyFile(source,'public/'+name)}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile('public/.nojekyll','');console.log('Static cloud website built.');
