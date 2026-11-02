import {selectGalleryImages} from '../server/enrich-appearance.mjs';
import {readDecorations,loadDecorationDetails,enrichDecorations,publishDecorations,publishDecorationStatus} from '../server/decorations.mjs';
import {seedDecorationBaseline} from '../server/update-decorations.mjs';
const snapshot=await readDecorations();
if(!snapshot.products.length)throw Error('No source catalogue has been collected');
await loadDecorationDetails(snapshot.products);
await selectGalleryImages(snapshot.products);
snapshot.appearanceAudit=await enrichDecorations(snapshot.products);
snapshot.appearanceReady=true;
snapshot.sourceReady=snapshot.products.every(p=>p.detailsReady)&&snapshot.browserImageAudit?.failed===0;
snapshot.ready=snapshot.sourceReady;
if(snapshot.ready&&!snapshot.baselineReady){await seedDecorationBaseline(snapshot);snapshot.baselineReady=true;}
await publishDecorations(snapshot);
await publishDecorationStatus(snapshot,snapshot.collectionAudit?.native||{});
console.log(JSON.stringify({success:snapshot.ready,products:snapshot.products.length,appearance:snapshot.appearanceAudit,firecrawlCredits:0,sourceRequestsMade:false}));
if(!snapshot.ready)process.exitCode=1;
