export const COMMITTED_RETAILERS = ['asda', 'ms', 'bm', 'hb', 'du', 'nx', 'jl', 'mt', 'bq', 'ar'];
export const hasCommittedRetailerSource = monitor => monitor?.collectionComplete === true && /^[a-f0-9]{40}$/.test(monitor.committedRevision || '');

// A private scan is only a staging checkpoint. A newer scan invalidates the
// previous commit; repeating the same scan must preserve its publication proof.
export async function recordRetailerScan(storage, id, scan) {
  if (!COMMITTED_RETAILERS.includes(id)) throw Error('Unsupported retailer scan');
  await storage.transaction(async db => {
    const key = id + '-monitor', previous = await db.get(key);
    const proof = previous?.observedAt === scan.observedAt
      ? {committedRevision: previous.committedRevision, committedAt: previous.committedAt} : {};
    await db.put(key, {...scan, ...proof});
  });
}

export async function markRetailerPublished({storage, body, now = new Date().toISOString()}) {
  const {id, commit, observedAt} = body || {};
  if (!COMMITTED_RETAILERS.includes(id) || !/^[a-f0-9]{40}$/.test(commit || '') || !Number.isFinite(Date.parse(observedAt))) throw Error('Invalid committed retailer evidence');
  let marked = false;
  await storage.transaction(async db => {
    const key = id + '-monitor', monitor = await db.get(key);
    if (monitor?.observedAt !== observedAt) return;
    await db.put(key, {...monitor, collectionComplete: true, committedRevision: commit, committedAt: now});
    marked = true;
  });
  return {marked, sourceRequestsMade: false, firecrawlCredits: 0};
}
