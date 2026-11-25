import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {bqImageKey} from '../server/bq-images.mjs';
import {chooseBqPreview} from '../server/bq-preview.mjs';
import {unavailableBqPreview,reusableUnavailableBqPreview} from '../server/bq-unavailable-preview.mjs';

const hashes=JSON.parse(await fs.readFile('web/bq/known-foreign-photos.json','utf8')).images.slice(0,2).map(i=>i.sha256);
const images=hashes.map((h,n)=>'https://media.diy.com/is/image/KingfisherDigital/example-'+n),p={retailerId:'bq',sku:'exact',variantName:'Christmas Baubles',department:'bq-baubles',observedAt:'2026-11-25T00:00:00Z',originalImages:images.map(url=>({url})),bqSource:{rawFingerprint:'source'}},index={},visual={};
images.forEach((asset,n)=>{const key=bqImageKey(asset);index[key]={asset,sha256:hashes[n],sourceVersion:'version-'+n,checkedAt:'2026-11-25T00:01:00Z'};visual[key]={imageHash:hashes[n]};});
const result=unavailableBqPreview(p,images,index,visual);assert(result?.unavailable);assert.equal(result.asset,undefined,'A failed gallery search must not invent an approved photograph');assert(reusableUnavailableBqPreview(p,images,result,index,visual));
const selections={[p.sku]:result};let requested=0;const originalFetch=globalThis.fetch;
try{globalThis.fetch=async()=>{requested++;throw Error('No request expected for an identical completed gallery');};await chooseBqPreview(p,{index,visual,selections});assert.equal(requested,0);assert.equal(selections[p.sku],result);}finally{globalThis.fetch=originalFetch;}
assert(!reusableUnavailableBqPreview({...p,observedAt:'2026-11-26T00:00:00Z'},images,result,index,visual));
assert(!reusableUnavailableBqPreview({...p,variantName:'Different Christmas Product'},images,result,index,visual));
assert(!reusableUnavailableBqPreview({...p,department:'bq-tree'},images,result,index,visual));
assert(!reusableUnavailableBqPreview(p,images.slice(0,1),result,index,visual));
for(const patch of [{sha256:'a'.repeat(64)},{sourceVersion:'changed'},{checkedAt:'2026-11-24T23:59:00Z'},{checkedAt:'invalid'},{error:'temporary failure'}]){const changed=structuredClone(index);Object.assign(changed[bqImageKey(images[0])],patch);assert(!reusableUnavailableBqPreview(p,images,result,changed,visual));}
const incomplete=structuredClone(index);delete incomplete[bqImageKey(images[1])];assert.equal(unavailableBqPreview(p,images,incomplete,visual),null,'An unexamined frame cannot be declared unavailable');
const changedVisual=structuredClone(visual);changedVisual[bqImageKey(images[0])].imageHash='f'.repeat(64);assert(!reusableUnavailableBqPreview(p,images,result,index,changedVisual));
console.log('An exhausted exact gallery is skipped without requests only for the same source and current verified bytes; new dates, offers, galleries, image versions, failures and partial evidence invalidate the negative result.');
