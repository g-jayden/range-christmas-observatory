import assert from 'node:assert/strict';import {exactNativeGalleryMember} from '../server/native-gallery-identity.mjs';
const p={sku:'1614068',variantId:'11385499',detailEvidence:{verifiedProductSection:true,selectedSku:'1614068'}},g={url:'https://www.therange.co.uk/media/full.jpg',variantId:'11385499'};
assert(exactNativeGalleryMember(p,g),'The official Range internal variant ID is distinct from the public SKU');
for(const q of [{...p,variantId:'other'},{...p,variantId:undefined},{...p,detailEvidence:{verifiedProductSection:false,selectedSku:p.sku}},{...p,detailEvidence:{verifiedProductSection:true,selectedSku:'other'}},{...p,retailerId:'du'}])assert(!exactNativeGalleryMember(q,g));
assert(!exactNativeGalleryMember(p,{...g,selectedSku:'other'}),'A conflicting explicit SKU cannot be overridden by a variant match');
assert(exactNativeGalleryMember({...p,retailerId:'du'},{url:g.url,selectedSku:p.sku}));
console.log('PASS: verified Range exact-SKU/internal-variant gallery binding works without inventing public SKU fields; wrong, absent and conflicting identities are rejected.');
