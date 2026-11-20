import assert from 'node:assert/strict';
import {createFavoritesReportController} from '../web/favorites-report.mjs';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
const {saveFavorites,favoriteProducts,removeFavorites,clearFavorites}=await import('../web/favorites-store.mjs');
const a={retailerId:'nx',sku:'one',department:'nx-tree',priceGBP:20},b={...a,sku:'two'},c={...a,retailerId:'jl',sku:'one'};
saveFavorites([a,b,c]);removeFavorites(['nx:one']);assert.deepEqual(favoriteProducts().map(p=>p.retailerId+':'+p.sku),['nx:two','jl:one']);clearFavorites();assert.equal(JSON.parse(memory.get('observatory-favorites-v1')).length,0);
let stored=null,calls=0,scheduled=[],revoked=[],next=0,states=[];
const cache={get:async key=>stored?.key===key?stored.blob:null,set:async(key,blob)=>{stored={key,blob};},remove:async()=>{stored=null;}};
const controller=createFavoritesReportController({cache,build:async rows=>{calls++;return [new TextEncoder().encode(rows.map(p=>p.sku).join(','))];},urls:{createObjectURL:()=> 'blob:'+ ++next,revokeObjectURL:x=>revoked.push(x)},schedule:f=>(scheduled.push(f),f),cancel:f=>{scheduled=scheduled.filter(x=>x!==f);}}),state=x=>states.push(x);
controller.prepare([a,b],state);await scheduled.shift()();assert.equal(states.at(-1).ready,true);assert.equal(await stored.blob.text(),'one,two');
controller.prepare([b],state);assert.equal(states.at(-1).ready,false);assert.deepEqual(revoked,['blob:1']);await scheduled.shift()();assert.equal(await stored.blob.text(),'two');assert.equal(calls,2);
controller.prepare([],state);await controller.storageIdle();assert.equal(stored,null);assert.equal(states.at(-1).ready,false);assert.deepEqual(revoked,['blob:1','blob:2']);
// An in-flight native fetch/old PDF cannot restore the deleted report.
let finish;const race=createFavoritesReportController({cache,build:()=>new Promise(resolve=>finish=resolve),urls:{createObjectURL:()=>{throw Error('Stale PDF must not become ready');},revokeObjectURL:()=>{}},schedule:f=>(scheduled.push(f),f),cancel:f=>{scheduled=scheduled.filter(x=>x!==f);}});
race.prepare([a],state);const pending=scheduled.shift()();await new Promise(setImmediate);race.prepare([],state);finish([new Uint8Array([1])]);await pending;await race.storageIdle();assert.equal(stored,null);assert.equal(states.at(-1).ready,false);
// Even a storage write already in progress is followed by the clear operation.
let finishWrite;const writeRace=createFavoritesReportController({cache:{...cache,set:()=>new Promise(resolve=>{finishWrite=()=>{stored={key:'old',blob:new Blob(['old'])};resolve();};})},build:async()=>[new Uint8Array([1])],urls:{createObjectURL:()=> 'blob:old',revokeObjectURL:()=>{}},schedule:f=>(scheduled.push(f),f),cancel:()=>{}});
writeRace.prepare([a],state);const saving=scheduled.shift()();await new Promise(setImmediate);writeRace.prepare([],state);finishWrite();await saving;await writeRace.storageIdle();assert.equal(stored,null);
console.log('Favorites individual/batch/clear and PDF deletion during build/write races passed');
const {productSize}=await import('../web/product-facts.mjs');
assert.match(productSize({specifications:{Size:'ONE',Height:'13cm',Width:'13cm',Length:'1cm'}}),/13/);
assert.match(productSize({specifications:{Size:'ONE'}}),/Size not specified/);
assert.equal(productSize({dimensions:{axes:[{key:'Height',cm:13}],label:'高度 · Height 13cm',sourceSize:'ONE'},specifications:{}}),'高度 · Height 13cm');
console.log('Native PDF captions use exact measurements before generic ONE-size labels');

const{componentSizeFacts}=await import('../web/product-facts.mjs');const pack={specifications:{Size:'ONE'},dimensions:{axes:[],label:'原站尺寸 · ONE'},sourceDescription:'50 baubles per pack. Set includes:14 x 8cm baubles20 x 3.8cm baubles16 x snowflakes'};const beforePack=JSON.stringify(pack),sizes=componentSizeFacts(pack);assert.deepEqual(sizes.componentSizes.map(p=>[p.quantity,p.measure]),[[14,'8cm'],[20,'3.8cm']]);assert.deepEqual(sizes.axes,[],'Piece counts are never interpreted as a physical measurement axis');assert.match(productSize(pack),/14 × 8cm.*20 × 3.8cm/);assert.equal(JSON.stringify(pack),beforePack);assert.equal(componentSizeFacts({sourceDescription:'Dimensions: 14 x 8cm'}),null);assert.equal(componentSizeFacts({sourceDescription:'Set includes: 14 x baubles, box width 8cm'}),null);assert.match(productSize({...pack,dimensions:{axes:[{key:'Height',cm:30}],label:'高度 · Height 30cm'}}),/Height 30cm/);
console.log('Description-only set component sizes survive into PDF and saved-photo captions; counts do not become dimensions, units are required and official single-product axes retain precedence.');
