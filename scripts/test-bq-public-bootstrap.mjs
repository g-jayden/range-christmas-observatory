import assert from 'node:assert/strict';
import {bqPublicBootstrapUrl} from '../server/bq-paid-source.mjs';
const url='https://www.diy.com/christmas/baubles.cat.data?sort=-product.relevance&page=86&_routes=routes%2Fplp';
assert.equal(bqPublicBootstrapUrl(url),'https://www.diy.com/christmas/baubles.cat?sort=-product.relevance');
assert.equal(bqPublicBootstrapUrl('https://www.diy.com/departments/tree/1234567890123_BQ.prd'),'https://www.diy.com/departments/tree/1234567890123_BQ.prd');
assert.throws(()=>bqPublicBootstrapUrl('https://example.com/baubles.cat'));
assert.equal(new URL(url).searchParams.get('page'),'86','Only the initial ordinary category visit changes; exact requested loader page is retained.');
console.log('PASS: the paid public-origin session starts at the category entry while exact requested page/sort URLs remain unchanged; foreign origins are rejected.');
