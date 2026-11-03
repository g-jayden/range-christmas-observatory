import {readLights,publishLights} from '../server/lights.mjs';
import {control,apiBase} from '../server/cloud-client.mjs';
// Finalize saved, complete directory evidence without opening Firecrawl.
// Confirmed retailer 403/404 assets remain explicit per-SKU source errors;
// they do not disable discovery and notifications for other healthy products.
const lights=await readLights();
if(lights.source?.complete&&lights.products.length){
 await publishLights(lights);
 if(!lights.baselineReady&&lights.operationalReady&&apiBase){
  await control('/internal/extend-baseline',{scope:'christmas-lights-v1',records:lights.products.map(p=>({sku:p.sku,everNew:p.arrivalEvidence==='initial-baseline'&&Boolean(p.everNew||p.newStatus)})),observedAt:lights.observedAt});
  lights.baselineReady=true;await publishLights(lights);
 }
 console.log(JSON.stringify({lightingBaselineReady:lights.baselineReady,operationalReady:lights.operationalReady,allSourceContentAvailable:lights.ready,coverage:lights.coverage,firecrawlCredits:0}));
}
