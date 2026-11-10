import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {control} from '../server/cloud-client.mjs';
import {recoverCommittedNotifications} from '../server/committed-notifications.mjs';
import {restoreVerifiedRegistry,reconcileVerifiedEvidence} from '../server/verified-evidence.mjs';
import {loadDecorationDetails,notificationSnapshot} from '../server/decorations.mjs';
import {loadLightingDetails} from '../server/lights.mjs';
import {loadThemeDetails} from '../server/themes.mjs';
import {buildMailAssets} from '../server/mail-assets.mjs';
import {publishCollectionCheckpoint} from '../server/collection-checkpoints.mjs';

const pending=await control('/internal/pending-evidence');
if(!pending.candidates.length){console.log(JSON.stringify({phase:'recover-committed-notifications',queued:0,firecrawlCredits:0,sourceRequestsMade:false}));process.exit(0);}
const read=(file,fallback={products:[]})=>fs.readFile('web/'+file+'.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return fallback;throw e;});
const snapshots=await Promise.all(['catalogue','decorations','lights','themes'].map(f=>read(f)));
await restoreVerifiedRegistry(snapshots[0].products);await loadDecorationDetails(snapshots[1].products);await loadLightingDetails(snapshots[2].products);await loadThemeDetails(snapshots[3].products);reconcileVerifiedEvidence(snapshots);
const combined=notificationSnapshot(snapshots[0],...snapshots.slice(1)),asda=await read('asda/catalogue');
const dir=p=>'web/mail-assets/'+(p.retailerId==='asda'?'asda-':'')+p.sku;
const originals=await read('new-original-recovery',{entries:{}}),byId=new Map([...combined.products,...asda.products].map(p=>[(p.retailerId||'the-range')+':'+p.sku,p]));let built=0;
for(const candidate of pending.candidates){const p=byId.get((candidate.retailerId||'the-range')+':'+candidate.sku);if(!p)continue;
 try{await fs.access(dir(p)+'/manifest.json');continue;}catch{}
 try{const e=originals.entries[p.originalImageUrl];if(!e?.ok||!e.skus?.includes(p.sku)||e.sourceUrl!==p.sourceUrl||!/^images\/source\/[a-f0-9]{64}\.jpg$/.test(e.cachedImageUrl))throw Error('No verified saved native original for pending SKU');const bytes=await fs.readFile('web/'+e.cachedImageUrl);if(createHash('sha256').update(bytes).digest('hex')!==e.hash)throw Error('Saved native original digest mismatch');p.originalCachedImageUrl=e.cachedImageUrl;p.originalImageEvidence={sourceUrl:e.url,sha256:e.hash,width:e.width,height:e.height,observedAt:e.observedAt};await buildMailAssets(p,null,{verifiedCardOnly:true});built++;}
 catch(e){console.log(JSON.stringify({phase:'prepare-saved-native-original',sku:p.sku,error:String(e.message).slice(0,200),firecrawlCredits:0}));}
}
if(built){const publication=await publishCollectionCheckpoint({stage:'recovered-new-assets'},{env:{...process.env,COLLECTION_CHECKPOINTS:'1'}});if(!publication?.published)throw Error('Recovered attachments must be committed before they can enter the mail queue');}
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report=await recoverCommittedNotifications({pending,products:[...combined.products,...asda.products],revision,controlCall:control,
 readManifest:p=>fs.readFile(dir(p)+'/manifest.json','utf8').then(JSON.parse),
 verifyOriginal:async(p,m)=>{const asset=m.original,url=new URL(asset.url),file=url.pathname.split('/').pop();if(!/^original\.(?:jpg|jpeg|png|webp|avif)$/.test(file))throw Error('Invalid native original path');const bytes=await fs.readFile(dir(p)+'/'+file);if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256||bytes.length!==asset.bytes)throw Error('Saved native original failed its byte check');}
});
report.cardsBuilt=built;await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/committed-notification-recovery.json',JSON.stringify(report));console.log(JSON.stringify(report));
// A committed capture keeps its real observation time; recovery is not a new
// source observation and must never advance the daily schedule or SKU history.
if(!report.deferred.length&&pending.monitor?.lastDiscoverySuccess)try{console.log(JSON.stringify(await control('/internal/evidence-recovered',{sourceObservedAt:pending.monitor.lastDiscoverySuccess,scanned:combined.products.length,queued:report.queued})));}catch(e){console.log(JSON.stringify({phase:'evidence-completion-pending',status:e.status||0,firecrawlCredits:0}));}
if(report.deferred.length)process.exitCode=1;
