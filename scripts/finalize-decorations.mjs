import {selectGalleryImages} from '../server/enrich-appearance.mjs';
import {readDecorations,loadDecorationDetails,enrichDecorations,publishDecorations,publishDecorationStatus,decorationReadiness} from '../server/decorations.mjs';
import {seedDecorationBaseline} from '../server/update-decorations.mjs';
const snapshot=await readDecorations();
if(!snapshot.products.length)throw Error('No source catalogue has been collected');
await loadDecorationDetails(snapshot.products);
await selectGalleryImages(snapshot.products);
snapshot.appearanceAudit=await enrichDecorations(snapshot.products);
snapshot.appearanceReady=true;
decorationReadiness(snapshot);
// Discovery and per-arrival verification do not depend on unrelated old 404s.
// Missing source specifications remain visibly unverified; never fabricate them.
if(snapshot.operationalReady&&!snapshot.baselineReady){await seedDecorationBaseline(snapshot);snapshot.baselineReady=true;}
await publishDecorations(snapshot);
await publishDecorationStatus(snapshot,snapshot.collectionAudit?.native||{});
console.log(JSON.stringify({success:snapshot.operationalReady,allSpecificationsVerified:snapshot.ready,coverage:snapshot.coverage,products:snapshot.products.length,appearance:snapshot.appearanceAudit,firecrawlCredits:0,sourceRequestsMade:false}));
if(!snapshot.operationalReady)process.exitCode=1;
