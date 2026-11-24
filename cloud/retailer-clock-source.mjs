// Source work is independent per retailer; only an existing task for that
// retailer (or an unreadable queue) suppresses another clock attempt.
export function retailerSourceBusy(queue, id) {
  if (!queue) return false;
  if (['production-queue-unavailable', 'repository-dispatch-credential-required'].includes(queue.reason)) return true;
  const path = '.github/workflows/' + id + '.yml';
  return [...(queue.active || []), ...(queue.independentActive || [])].some(run => String(run.path || '').split('@')[0] === path);
}
