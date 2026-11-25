import assert from 'node:assert/strict';
import {springDailyReviewProducts} from '../server/spring-daily-review-plan.mjs';
const products=[{sku:'1',springAudit:{disposition:'include'}},{sku:'2',springAudit:{disposition:'review'}},{sku:'3',springAudit:{disposition:'review'},everNew:true,arrivalEvidence:'observed-after-baseline',firstNewObservedAt:'2026-11-25T00:00:00Z'},{sku:'4',springAudit:{disposition:'exclude'}},{sku:'5'}],source={products,source:{complete:true,expected:5},observedAt:'2026-11-25T00:00:00Z',dailyPlan:{observedAt:'2026-11-25T00:00:00Z',sourceProducts:5,detailSkus:['1']}};
const before=JSON.stringify(source);
assert.deepEqual(springDailyReviewProducts(source,{mode:'daily'}).map(p=>p.sku),['1','3','5']);
assert.equal(JSON.stringify(source),before,'Planning must not alter the full inventory, old review queue, facts, native bytes or dates');
assert.strictEqual(springDailyReviewProducts(source,{mode:'all'}),products,'An explicit full/cached classification still reviews every product');
for(const broken of [{...source,source:{complete:false,expected:5}},{...source,dailyPlan:{...source.dailyPlan,observedAt:'old'}},{...source,dailyPlan:{...source.dailyPlan,sourceProducts:4}},{...source,dailyPlan:{...source.dailyPlan,detailSkus:['unknown']}},{...source,dailyPlan:{...source.dailyPlan,detailSkus:['1','1']}}])assert.throws(()=>springDailyReviewProducts(broken,{mode:'daily'}));
console.log('PASS: daily photo work covers changed SKUs, genuine unverified arrivals and unclassified records, preserves the complete inventory and all old pending evidence, and rejects stale/incomplete/foreign plans.');
