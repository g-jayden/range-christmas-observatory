import assert from'node:assert/strict';import{reusableBqSource,preferBqStagedSource}from'../server/bq-source-checkpoint.mjs';
const now=Date.parse('2026-11-24T00:00:00Z'),stage={observedAt:'2026-11-23T22:30:00Z',collectionComplete:true,automaticArrivalChecks:true,sourceAudits:Array.from({length:10},()=>({complete:true,closingVerified:true,unique:1,expected:1})),products:[{sku:'123'}],variantEvidencePending:[]},old={observedAt:'2026-11-22T00:00:00Z'};
assert(reusableBqSource(stage,now));assert(preferBqStagedSource(stage,old,now),'The current 06:30 scan must survive a photo-only rebuild with an older accepted catalogue');
for(const changed of[{...stage,observedAt:'2026-11-23T21:59:59Z'},{...stage,observedAt:'2026-11-24T00:00:01Z'},{...stage,sourceAudits:stage.sourceAudits.slice(1)},{...stage,products:[{sku:'123'},{sku:'123'}]},{...stage,variantEvidencePending:[{sku:'124'}]},{...stage,collectionComplete:false}])assert(!preferBqStagedSource(changed,old,now));
assert(!preferBqStagedSource(stage,{observedAt:'2026-11-23T23:30:00Z'},now),'A stale stage cannot replace a newer accepted source');
assert(!preferBqStagedSource(null,old,now));
console.log('PASS: photo continuation reuses a complete 06:xx exact source without new source requests; missing variants, drift, duplicate SKUs, stale/future observations and older stages are rejected.');
