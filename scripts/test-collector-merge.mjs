import assert from'node:assert/strict';import{mergeCollectorLedgers,mergeCollectorImageCaches}from'../server/collector-merge.mjs';
const base={version:2,periods:{'2026-11':{used:1702,runs:[],reservations:{old:{amount:60}}}}};
const ledger=(credits,id)=>({...base,periods:{'2026-11':{...base.periods['2026-11'],used:1702+credits,runs:[{key:id,credits,receipt:{id},completedAt:'2026-11-19'}]}}});
const m=mergeCollectorLedgers(base,ledger(1,'nx'),ledger(9,'jl'));assert.equal(m.periods['2026-11'].used,1712);assert.equal(m.periods['2026-11'].runs.length,2);assert.equal(m.periods['2026-11'].reservations.old.amount,60);
assert.equal(mergeCollectorLedgers(base,ledger(9,'same'),ledger(9,'same')).periods['2026-11'].used,1711);assert.throws(()=>mergeCollectorLedgers(base,ledger(9,'same'),ledger(10,'same')),/amount/);
const cache=mergeCollectorImageCaches({version:1,entries:{}},{version:1,entries:{a:{score:1}}},{version:1,entries:{b:{score:2}}});assert.equal(Object.keys(cache.entries).length,2);assert.throws(()=>mergeCollectorImageCaches({version:0},{version:1,entries:{}},{version:2,entries:{}}),/Conflicting/);
console.log('PASS: concurrent retailer receipts merge once without losing prior charges or uncertain holds; distinct image reviews survive, incompatible evidence fails closed.');
