import{retailerForScope}from'../web/retailers.mjs';
import {retailerEnabled} from '../web/retailer-activation.mjs';
import {MT_DEPARTMENTS} from '../web/mt-model.mjs';import{BQ_DEPARTMENTS}from'../web/bq-model.mjs';
import assert from 'node:assert/strict';
import {DEPARTMENTS,THEME_DEFINITIONS} from '../web/catalogue-model.mjs';
import {CATALOGUE_GROUPS,RETAILERS,cataloguePath,normaliseScope,readCatalogueLocation,catalogueLocation} from '../web/catalogue-navigation.mjs';
const ids=CATALOGUE_GROUPS.flatMap(g=>g.children);
assert.equal(new Set(ids).size,ids.length,'A category must appear once in the catalogue');
assert.deepEqual([...ids].sort(),DEPARTMENTS.filter(d=>d.id!=='themes'&&retailerForScope(d.id)==='the-range').map(d=>d.id).sort(),'The hierarchical catalogue must retain every current product view');
assert.deepEqual(CATALOGUE_GROUPS.find(g=>g.id==='themes').children,THEME_DEFINITIONS.map(t=>t.id));
for(const id of ids){const p=cataloguePath(id);assert.equal(p[0].id,'the-range');assert.equal(p[1].id,'christmas');assert.equal(p.at(-1).id,id);assert.equal(p.length,4);for(const mode of ['all','new','today']){const url=catalogueLocation('https://example.com/catalogue/?v=existing',id,mode);assert.equal(new URL(url,'https://example.com').searchParams.get('v'),'existing');assert.deepEqual(readCatalogueLocation(url),{retailer:'the-range',collection:'christmas',scope:id,mode});}}
assert.equal(normaliseScope('themes'),THEME_DEFINITIONS[0].id,'Old theme links remain valid');
for(const id of ['__proto__','constructor','missing',null])assert.equal(normaliseScope(id),'tree');
assert.equal(readCatalogueLocation('?scope=wreath&mode=unknown').mode,'all');
assert.equal(RETAILERS[0].collections.filter(c=>c.available).length,1,'Future collections must not pretend to contain Christmas data');
console.log('PASS: all 28 category views, six themes, retailer/season hierarchy, deep links, invalid routes and retained view modes.');

for(const id of ['asda-tree','asda-tree-decorations','asda-lights','asda-room','asda-wreath','asda-garland','asda-outdoor']){assert.equal(cataloguePath(id)[0].id,'asda');assert.equal(readCatalogueLocation(catalogueLocation('https://example.com',id,'today')).scope,id);}

for(const id of ["ms-baubles","ms-lights","ms-garland","ms-wreath","ms-stockings","ms-tree"]){assert.equal(cataloguePath(id)[0].id,"ms");for(const mode of ["all","new","today"])assert.deepEqual(readCatalogueLocation(catalogueLocation("https://example.com",id,mode)),{retailer:"ms",collection:"christmas",scope:id,mode});}

for(const [retailer,departments]of [['mt',MT_DEPARTMENTS],['bq',BQ_DEPARTMENTS]])if(retailerEnabled(retailer))for(const d of departments){assert.equal(cataloguePath(d.id)[0].id,retailer);for(const mode of ['all','new','today'])assert.deepEqual(readCatalogueLocation(catalogueLocation('https://example.com',d.id,mode)),{retailer,collection:'christmas',scope:d.id,mode});}
