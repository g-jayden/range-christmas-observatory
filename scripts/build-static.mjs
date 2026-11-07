import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {copyPublishedAssets} from './publish-assets.mjs';
await fs.rm('public',{recursive:true,force:true});
await fs.mkdir('public',{recursive:true});
for(const name of ['catalogue.json','status.json','settings.json','service.json','collection-policy.json','collection-ledger.json','monitor-state.json','new-arrivals.json','monitor-proof.json'])JSON.parse(await fs.readFile('web/'+name,'utf8'));
for(const name of ['index.html','dashboard-full.css','dashboard-full.js','catalogue.json','status.json','image-check.html','image-check.js','controls.js','settings.json','service.json','collection-policy.json','collection-ledger.json','monitor-state.json','monitor-labels.mjs','new-arrivals.json','monitor-proof.json','confirm.html','product.html','catalogue-model.mjs','theme-model.mjs','taxonomy.mjs','product-preview.mjs','product-preview-dialog.js','catalogue-navigation.mjs','dashboard-navigation.js'])await fs.copyFile('web/'+name,'public/'+name);
const previewModelHash=createHash('sha256').update(await fs.readFile('web/product-preview.mjs')).digest('hex').slice(0,12);let previewDialog=await fs.readFile('public/product-preview-dialog.js','utf8');await fs.writeFile('public/product-preview-dialog.js',previewDialog.replaceAll("'./product-preview.mjs'","'./product-preview.mjs?v="+previewModelHash+"'"));const previewDialogHash=createHash('sha256').update(await fs.readFile('public/product-preview-dialog.js')).digest('hex').slice(0,12);let dashboard=await fs.readFile('public/dashboard-full.js','utf8');await fs.writeFile('public/dashboard-full.js',dashboard.replaceAll("'./product-preview-dialog.js'","'./product-preview-dialog.js?v="+previewDialogHash+"'"));
const taxonomyHash=createHash('sha256').update(await fs.readFile('web/taxonomy.mjs')).digest('hex').slice(0,12);let cm=await fs.readFile('public/catalogue-model.mjs','utf8');await fs.writeFile('public/catalogue-model.mjs',cm.replaceAll("'./taxonomy.mjs'","'./taxonomy.mjs?v="+taxonomyHash+"'"));
const themeHash=createHash('sha256').update(await fs.readFile('web/theme-model.mjs')).digest('hex').slice(0,12);for(const file of ['catalogue-model.mjs']){const t=await fs.readFile('public/'+file,'utf8');await fs.writeFile('public/'+file,t.replaceAll("'./theme-model.mjs'","'./theme-model.mjs?v="+themeHash+"'"));}
const modelHash=createHash('sha256').update(await fs.readFile('public/catalogue-model.mjs')).digest('hex').slice(0,12);
for(const file of ['dashboard-full.js','controls.js','catalogue-navigation.mjs','dashboard-navigation.js']){const text=await fs.readFile('public/'+file,'utf8');await fs.writeFile('public/'+file,text.replaceAll("'./catalogue-model.mjs'","'./catalogue-model.mjs?v="+modelHash+"'"));}
const navigationModelHash=createHash('sha256').update(await fs.readFile('public/catalogue-navigation.mjs')).digest('hex').slice(0,12);for(const file of ['dashboard-full.js','dashboard-navigation.js','controls.js']){const text=await fs.readFile('public/'+file,'utf8');await fs.writeFile('public/'+file,text.replaceAll("'./catalogue-navigation.mjs'","'./catalogue-navigation.mjs?v="+navigationModelHash+"'"));}
const navigationHash=createHash('sha256').update(await fs.readFile('public/dashboard-navigation.js')).digest('hex').slice(0,12);const main=await fs.readFile('public/dashboard-full.js','utf8');await fs.writeFile('public/dashboard-full.js',main.replaceAll("'./dashboard-navigation.js'","'./dashboard-navigation.js?v="+navigationHash+"'"));
for(const page of ['index.html','image-check.html']){
 let html=await fs.readFile('public/'+page,'utf8');
 for(const asset of ['dashboard-full.css','dashboard-full.js','controls.js','image-check.js']){
  const hash=createHash('sha256').update(await fs.readFile('public/'+asset)).digest('hex').slice(0,12);html=html.replaceAll('"'+asset+'"','"'+asset+'?v='+hash+'"');
 }
 await fs.writeFile('public/'+page,html);
}
for(const name of ['preview-status.json','classified','taxonomy-status.json','taxonomy-audit.json','decorations.json','decorations-status.json','decoration-details','lights.json','lights-status.json','light-details','themes.json','themes-status.json','theme-details'])try{const source='web/'+name;const st=await fs.stat(source);if(st.isDirectory())await fs.cp(source,'public/'+name,{recursive:true});else await fs.copyFile(source,'public/'+name)}catch(e){if(e.code!=='ENOENT')throw e;}
await copyPublishedAssets('web','public',{repositoryImages:true});
await fs.writeFile('public/.nojekyll','');console.log('Static cloud website built.');
