import fs from 'node:fs/promises';import {enrichProducts} from '../server/enrich-appearance.mjs';import {atomicJson} from '../server/sync.mjs';import {digest} from '../server/collection-policy.mjs';
import {readDecorations,loadDecorationDetails,publishDecorations,publishDecorationStatus} from '../server/decorations.mjs';
import {materialFacts} from '../server/appearance.mjs';
import {buildMailAssets} from '../server/mail-assets.mjs';
const d=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));d.appearanceAudit=await enrichProducts(d.products);d.revision=digest({observedAt:d.observedAt,products:d.products,sources:d.sources,excluded:d.excluded});if(d.browserImageAudit)d.browserImageAudit.catalogueRevision=d.revision;await atomicJson('web/catalogue.json',d);const s=JSON.parse(await fs.readFile('web/status.json','utf8'));s.revision=d.revision;s.appearanceAudit=d.appearanceAudit;if(s.browserImageAudit)s.browserImageAudit.catalogueRevision=d.revision;await atomicJson('web/status.json',s);console.log(JSON.stringify(d.appearanceAudit));
// Apply parsing fixes to saved source descriptions without another paid read.
const decorations=await readDecorations();if(decorations.products.length){await loadDecorationDetails(decorations.products);for(const p of decorations.products)if(p.specifications)p.material=materialFacts(p.specifications,p.sourceDescription||'').label;const priorStatus=await fs.readFile('web/decorations-status.json','utf8').then(JSON.parse).catch(()=>({}));await publishDecorations(decorations);await publishDecorationStatus(decorations,priorStatus.native||{});}
const products=new Map([...decorations.products,...d.products].map(p=>[p.sku,p]));let cardsUpdated=0;
for(const name of await fs.readdir('web/mail-assets').catch(()=>[])){
 const dir='web/mail-assets/'+name,manifest=await fs.readFile(dir+'/manifest.json','utf8').then(JSON.parse).catch(()=>null),p=products.get(name);
 if(!manifest||!p||manifest.material===p.material)continue;
 const original='mail-assets/'+name+'/'+new URL(manifest.original.url).pathname.split('/').pop();await fs.access('web/'+original);
 p.originalCachedImageUrl=original;p.originalImageUrl=manifest.original.sourceUrl;p.newEvidence={...p.newEvidence,observedAt:manifest.observedAt};
 const proof=manifest.proof?await fs.readFile(dir+'/proof.png'):null;await buildMailAssets(p,proof?.toString('base64'));cardsUpdated++;
}
console.log(JSON.stringify({savedSourceMaterialsRecomputed:decorations.products.length,cardsUpdated,sourceRequestsMade:false,firecrawlCredits:0}));
