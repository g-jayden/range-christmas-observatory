import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {control} from '../server/cloud-client.mjs';
import {buildMailAssets} from '../server/mail-assets.mjs';
import {readDecorations,loadDecorationDetails,notificationSnapshot} from '../server/decorations.mjs';
import {readLights,loadLightingDetails} from '../server/lights.mjs';
import {readThemes,loadThemeDetails} from '../server/themes.mjs';
import {isPublishedProduct,christmasEligibility,offeredObject} from '../web/taxonomy.mjs';
const recovery=await fs.readFile('web/browser-image-recovery.json','utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(!recovery)process.exit(0);
const completed=new Set(recovery.mailRecoveryCompleted||[]),skus=[...new Set(Object.values(recovery.entries||{}).map(e=>e.sku))].filter(s=>!completed.has(s));
if(!skus.length)process.exit(0);
const trees=JSON.parse(await fs.readFile('web/catalogue.json')),decorations=await readDecorations(),lights=await readLights(),themes=await readThemes();
await loadDecorationDetails(decorations.products);await loadLightingDetails(lights.products);await loadThemeDetails(themes.products);
const products=notificationSnapshot(trees,decorations,lights,themes).products;
for(const sku of skus){
 const p=products.find(p=>p.sku===sku),entry=Object.values(recovery.entries).find(e=>e.sku===sku);if(!p?.newStatus||p.arrivalEvidence!=='observed-after-baseline'||!isPublishedProduct(p)||christmasEligibility(p,offeredObject(p)).disposition!=='include'||p.detailEvidence?.selectedSku!==sku||!p.detailEvidence.verifiedProductSection)throw Error('Unverified or out-of-scope NEW recovery '+sku);
 if(!/^\d{1,12}$/.test(sku)||!/^images\/source\/[a-f0-9]{64}\.(?:jpg|png|webp|gif|avif)$/.test(entry.cachedImageUrl)||!Number.isFinite(Date.parse(p.attributeObservedAt))||Date.now()-Date.parse(p.attributeObservedAt)>6*3600000)throw Error('Recovery path or current detail age invalid '+sku);
 const dir='web/mail-assets/'+sku,capture=JSON.parse(await fs.readFile(dir+'/capture.json'));if(!['proof-browser.jpg','proof-source.bin','proof.png'].includes(capture.file))throw Error('Invalid source screenshot file');const proof=await fs.readFile(dir+'/'+capture.file),fingerprint=capture.fingerprint&&JSON.parse(capture.fingerprint);
 const exact=fingerprint?fingerprint[0]===sku&&fingerprint[1]===p.sourceUrl&&fingerprint[2]===p.variantImageUrl&&fingerprint[3]===p.priceGBP:capture.verifiedBy==='normal-browser-exact-SKU-gallery'&&capture.galleryMappingVerified&&capture.sku===sku&&capture.sourceUrl===p.sourceUrl&&capture.variantImageUrl===p.variantImageUrl&&capture.priceGBP===p.priceGBP&&p.originalImages?.some(g=>g.url===capture.originalImageUrl&&String(g.variantId)===String(capture.variantId));
 const age=Date.now()-Date.parse(capture.capturedAt);if(!exact||!Number.isFinite(age)||age<0||age>86400000||createHash('sha256').update(proof).digest('hex')!==capture.sha256||capture.originalImageUrl!==entry.url||p.originalImageUrl!==entry.url)throw Error('Source proof identity or digest mismatch '+sku);
 const bytes=await fs.readFile('web/'+entry.cachedImageUrl),meta=await sharp(bytes).metadata();if(createHash('sha256').update(bytes).digest('hex')!==entry.hash||meta.width!==entry.width||meta.height!==entry.height)throw Error('Native original digest or dimensions mismatch '+sku);
 p.originalCachedImageUrl=entry.cachedImageUrl;p.originalImageEvidence={sourceUrl:entry.url,sha256:entry.hash,width:meta.width,height:meta.height,observedAt:entry.observedAt};
 const assets=await buildMailAssets(p,proof.toString('base64'));
 const result=await control('/internal/recover-event',{product:p,screenshotBase64:proof.toString('base64'),screenshotVerifiedAt:capture.capturedAt});if(!result.recorded&&!result.alreadyRecorded)throw Error('Cloud did not acknowledge recovered SKU '+sku);
 completed.add(sku);recovery.mailRecoveryCompleted=[...completed];await fs.writeFile('web/browser-image-recovery.json',JSON.stringify(recovery));console.log(JSON.stringify({phase:'browser-native-NEW-recovery',sku,recorded:Boolean(result.recorded),alreadyRecorded:Boolean(result.alreadyRecorded),firecrawlCredits:0}));
}
