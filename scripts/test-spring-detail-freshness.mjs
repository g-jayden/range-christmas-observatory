import assert from 'node:assert/strict';import {springDetailRefreshNeeded} from '../server/update-spring.mjs';
const observedAt='2026-11-24T22:00:00Z',now=Date.parse('2026-11-24T23:00:00Z'),p={sku:'123',detailsReady:true,attributeObservedAt:'2026-11-23T22:01:00Z',detailEvidence:{verifiedProductSection:true,selectedSku:'123'}};
assert(springDetailRefreshNeeded(p,observedAt,{now}),'A new complete directory must not indefinitely reuse older dimensions/materials just because a title and photo URL stayed unchanged');
assert.equal(springDetailRefreshNeeded({...p,attributeObservedAt:'2026-11-24T22:01:00Z'},observedAt,{now}),false,'A resumed cycle does not pay again for already current details');
assert(springDetailRefreshNeeded({...p,detailsReady:false},observedAt,{now}));assert(springDetailRefreshNeeded({...p,detailEvidence:{verifiedProductSection:true,selectedSku:'other'}},observedAt,{now}));assert(springDetailRefreshNeeded({...p,attributeObservedAt:'2100-01-01T00:00:00Z'},observedAt,{now}));
assert.equal(springDetailRefreshNeeded(p,observedAt,{now,detailMaxAgeDays:7}),false);
console.log('PASS: full Spring observations honour the existing detail-age policy, preserve same-cycle cache reuse and never certify missing, foreign or future-dated detail evidence.');
