import fs from 'node:fs/promises';import {control,apiBase} from '../server/cloud-client.mjs';
export async function syncTaxonomyQueue(controlCall=control){
 const report=JSON.parse(await fs.readFile('web/taxonomy-status.json','utf8')),products=[];
 for(const name of await fs.readdir('web/taxonomy-index'))for(const [sku,a]of Object.entries(JSON.parse(await fs.readFile('web/taxonomy-index/'+name,'utf8')))){const manifest=await fs.readFile('web/mail-assets/'+sku+'/manifest.json','utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return null});products.push({sku,disposition:a.disposition,primary:a.primary,memberships:a.memberships,...(manifest?{mailAssets:manifest}:{})})};
 let eventsUpdated=0,pendingUpdated=0,excludedPending=0;
 for(let offset=0;offset<products.length;offset+=500){const r=await controlCall('/internal/classification-sync',{version:report.version,products:products.slice(offset,offset+500)});if(!r.synced||r.sent!==0||r.seenHistoryChanged!==false)throw Error('Taxonomy queue reconciliation failed');eventsUpdated+=r.eventsUpdated;pendingUpdated+=r.pendingUpdated;excludedPending+=r.excludedPending;}
 return {products:products.length,eventsUpdated,pendingUpdated,excludedPending,sent:0,seenHistoryChanged:false,firecrawlCredits:0};
}
if(process.argv[1]?.endsWith('/sync-taxonomy-queue.mjs')){if(!apiBase||!process.env.CONTROL_TOKEN)throw Error('Private queue control credentials are required');console.log(JSON.stringify({phase:'classification-queue-sync',...await syncTaxonomyQueue()}));}
