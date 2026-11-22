// Quantity and spending limits are distinct from provider request/page sizes.
// Provider timeouts and concurrency still bound an individual operation.
export const UNRESTRICTED_LIMIT_KEYS=['maxDetailPagesPerRun','maxScreenshotPagesPerRun','maxCreditsPerRun','maxCreditsPerCalendarMonth','maxNativePagesPerRun','maxFallbackScrapesPerRun','browserCreditsPerRun','fullRefreshMaxCreditsPerRun'];
export function unrestrictedCollection(policy){
 const a=policy?.unlimitedCollectionAuthorization;
 return a?.enabled===true&&a.scope==='all-enabled-retailers'&&a.freeFirst===true&&a.paidFallback===true&&a.productLimit===null&&a.detailLimit===null&&a.imageLimit===null&&a.creditLimit===null&&a.automaticPurchaseOrPlanUpgrade===false&&Number.isFinite(Date.parse(a.approvedAt))&&Number.isFinite(policy.accountReserveCredits)&&policy.accountReserveCredits>=5000;
}
export function normalizeCollectionLimits(policy){
 if(!unrestrictedCollection(policy))return policy;
 return {...policy,...Object.fromEntries(UNRESTRICTED_LIMIT_KEYS.map(k=>[k,Infinity])),automaticBudgetExpansion:true};
}
export function initialCreditReservation(policy){
 // This is a refillable reservation, never a collection or billing ceiling.
 return unrestrictedCollection(policy)?16:policy.maxCreditsPerRun;
}
export async function ensureCollectionCreditReservation(budget,policy,{spent=0,credits=5,confirmedCredits=0}={}){
 while(spent+credits>budget.limit){
  if(!unrestrictedCollection(policy)||typeof budget.extend!=='function')throw Error('Collection credit reservation exhausted');
  const before=budget.limit;await budget.extend({additionalCredits:32,creditsAlreadyBilled:confirmedCredits});
  if(!(budget.limit>before))throw Error('Collection reservation did not advance');
 }
}
