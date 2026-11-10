import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseMsPage} from '../server/ms-source.mjs';
import {MS_SOURCES} from '../web/ms-model.mjs';
import {atomicJson} from '../server/sync.mjs';

// Read the public production channel in the same runner that will collect daily.
// This probe never calls Firecrawl and does not advance catalogue timestamps.
const snapshot=JSON.parse(await fs.readFile('web/ms/catalogue.json','utf8'));
const sample=snapshot.products.find(p=>p.inStock&&p.departmentIds?.length);
if(!sample)throw Error('M&S channel probe requires a verified exact SKU baseline');
const get=async url=>{const u=new URL(url);if(!['https://www.marksandspencer.com','https://assets.digitalcontent.marksandspencer.app'].includes(u.origin))throw Error('Unexpected M&S probe origin');const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('M&S public channel HTTP '+r.status);return r;};
const directory=parseMsPage(await (await get(MS_SOURCES[0].url+'?sort=minPrice+asc&page=1')).text());
if(directory.type!=='listing'||!directory.total||!directory.products?.length)throw Error('M&S production directory did not return real products');
const product=parseMsPage(await (await get(sample.sourceUrl.split('#')[0])).text());
if(product.product?.productExternalId!==sample.parentGroupId||!product.product.variants.some(v=>v.skus.some(s=>String(s.id)===sample.sku)))throw Error('M&S production exact SKU identity mismatch');
const photo=Buffer.from(await (await get(sample.variantImageUrl)).arrayBuffer());
const sharp=(await import('sharp')).default,m=await sharp(photo).metadata();
if(!m.width||!m.height)throw Error('M&S production native image cannot be decoded');
const report={state:'verified',checkedAt:new Date().toISOString(),directoryCount:directory.total,sampleSku:sample.sku,familyId:sample.parentGroupId,nativeImage:{sha256:createHash('sha256').update(photo).digest('hex'),width:m.width,height:m.height,sourceUrl:sample.variantImageUrl},sourceRequests:3,firecrawlCredits:0,method:'ordinary-public-HTTPS-from-production-runner'};
await atomicJson('web/ms/live-channel.json',report);console.log(JSON.stringify(report));
