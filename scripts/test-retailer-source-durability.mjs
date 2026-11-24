import assert from 'node:assert/strict';
import {COMMITTED_RETAILERS, recordRetailerScan, markRetailerPublished, hasCommittedRetailerSource} from '../cloud/retailer-published.mjs';
import {digestSourceBarrier} from '../cloud/daily-digest.mjs';
import {dispatchMsDue} from '../cloud/ms-clock.mjs';
import {dispatchHbDue} from '../cloud/hb-clock.mjs';
import {dispatchDuDue} from '../cloud/du-clock.mjs';
import {dispatchBmDue} from '../cloud/bm-clock.mjs';
import {dispatchAsdaDue} from '../cloud/asda-clock.mjs';
import fs from 'node:fs/promises';
class DB {
  rows = new Map();
  async get(k) { return this.rows.get(k); }
  async put(k, v) { this.rows.set(k, v); }
  async transaction(fn) { return fn(this); }
}
const at = '2026-11-23T22:10:00Z', later = '2026-11-23T22:20:00Z', now = Date.parse('2026-11-23T23:00:00Z');
for (const id of COMMITTED_RETAILERS) {
  const db = new DB(), scope = id === 'ms' || id === 'nx' || id === 'jl' ? id + '-baubles' : id + '-tree';
  await recordRetailerScan(db, id, {observedAt: at, collectionComplete: true, automaticArrivalChecks: true});
  assert(!hasCommittedRetailerSource(await db.get(id + '-monitor')));
  assert(!(await digestSourceBarrier(db, [scope], now)).ready, id + ' must wait when its scan was never saved');
  assert(!(await markRetailerPublished({storage: db, body: {id, observedAt: later, commit: 'a'.repeat(40)}})).marked);
  assert((await markRetailerPublished({storage: db, body: {id, observedAt: at, commit: 'b'.repeat(40)}})).marked);
  assert((await digestSourceBarrier(db, [scope], now)).ready);
  await recordRetailerScan(db, id, {observedAt: at, collectionComplete: true, automaticArrivalChecks: true});
  assert.equal((await db.get(id + '-monitor')).committedRevision, 'b'.repeat(40));
  await recordRetailerScan(db, id, {observedAt: later, collectionComplete: true, automaticArrivalChecks: true});
  assert(!hasCommittedRetailerSource(await db.get(id + '-monitor')), id + ' newer private scan cannot inherit an old publication');
  assert(!(await digestSourceBarrier(db, [scope], now)).ready);
}
for (const [id, clock] of [['ms', dispatchMsDue], ['hb', dispatchHbDue], ['du', dispatchDuDue], ['bm', dispatchBmDue], ['asda', dispatchAsdaDue]]) {
  const db = new DB(); await db.put('baseline/' + id + '-christmas-v1', {});
  await recordRetailerScan(db, id, {observedAt: at, collectionComplete: true});
  let calls = 0; const args = {storage: db, env: {GITHUB_DISPATCH_TOKEN: 'fixture'}, now, fetcher: async () => { calls++; return new Response(null, {status: 204}); }};
  assert((await clock(args)).dispatched, id + ' must not suppress recovery after a failed publication');
  await markRetailerPublished({storage: db, body: {id, observedAt: at, commit: 'c'.repeat(40)}});
  assert(!(await clock(args)).due); assert.equal(calls, 1);
  const busy = new DB(); await busy.put('baseline/' + id + '-christmas-v1', {});
  const same = {clear: true, independentActive: [{id: 42, path: '.github/workflows/' + id + '.yml', status: 'in_progress'}]};
  assert((await clock({...args, storage: busy, productionQueue: same})).sameRetailerBusy);
  assert.equal(await busy.get(id + '-clock'), undefined, 'Waiting on the current retailer must not consume another attempt');
  const other = {clear: false, active: [{id: 43, path: '.github/workflows/range-native.yml', status: 'in_progress'}]};
  assert((await clock({...args, storage: busy, productionQueue: other})).dispatched, 'A different retailer source cannot stall ' + id);
  const failed = new DB(); await failed.put('baseline/' + id + '-christmas-v1', {});
  assert((await clock({...args, storage: failed, productionQueue: {reason: 'production-queue-unavailable'}})).waiting);
  assert.equal(await failed.get(id + '-clock'), undefined);
}
for (const id of ['ms', 'hb']) {
  const workflow = await fs.readFile('.github/workflows/' + id + '.yml', 'utf8');
  assert(workflow.includes("EVIDENCE_ISOLATE_WORKTREE: '1'"));
  assert(workflow.includes('/web/preview-quality-cache.json.gz'));
  assert(workflow.indexOf('Archive exact source') < workflow.indexOf('Preserve '));
  assert(workflow.includes("steps.evidence.outcome == 'success' && (inputs.mode == 'activate'"));
  const delivery = await fs.readFile('scripts/deliver-' + id + '-notifications.mjs', 'utf8');
  assert(delivery.includes('const revision=publishedEvidenceRevision()'));
}
console.log('PASS: all ten retailer scans require a durable matching commit; failed publication cannot suppress recovery or release a partial digest; repeated scan preserves proof, changed scan invalidates it, and archived source can be reused.');

const du = await fs.readFile('.github/workflows/du.yml', 'utf8');
assert(du.includes('group: range-du-source'));
const range = await fs.readFile('.github/workflows/daily-pages.yml', 'utf8');
assert((await fs.readFile('.github/workflows/asda.yml', 'utf8')).includes('group: range-asda-source'), 'ASDA cannot wait behind an unrelated full Range collection');
