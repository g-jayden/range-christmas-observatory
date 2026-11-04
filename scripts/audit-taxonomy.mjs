import fs from 'node:fs/promises';
import {readDecorations,loadDecorationDetails} from '../server/decorations.mjs';
import {readLights,loadLightingDetails} from '../server/lights.mjs';
import {readThemes,loadThemeDetails} from '../server/themes.mjs';
import {auditTaxonomy} from '../server/taxonomy-audit.mjs';
const d=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),c=await readDecorations(),l=await readLights(),t=await readThemes();
await loadDecorationDetails(c.products);await loadLightingDetails(l.products);await loadThemeDetails(t.products);
const result=await auditTaxonomy([d,c,l,t],{infer:!process.argv.includes('--reuse-only')});
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/taxonomy-records.json',JSON.stringify(result.canonical));
