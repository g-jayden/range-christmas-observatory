// The extra two credits are a one-time, retailer-scoped user authorization.
// Other retailers keep the original 1,500-credit cap and cannot spend this grant.
export function hbOnboardingPolicy(policy,ledger,{period,enabled=false}={}){
 if(!enabled)return policy;
 const grant=policy.oneOffAuthorizations?.find(g=>g.id==='hb-onboarding-2026-11'&&g.retailerId==='hb'&&g.period===period&&g.additionalCredits===2);if(!grant)throw Error('Home Bargains one-off source acceptance is not authorized for this period');
 const used=(ledger.periods?.[period]?.runs||[]).filter(r=>r.receipt?.authorizationId===grant.id).reduce((n,r)=>n+r.credits,0),remaining=Math.max(0,grant.additionalCredits-used);if(remaining<1)throw Error('Home Bargains one-off source acceptance allowance is already consumed');
 return {...policy,minimumReservationCredits:1,maxCreditsPerRun:Math.min(2,remaining),maxCreditsPerCalendarMonth:policy.maxCreditsPerCalendarMonth+grant.additionalCredits,authorizationId:grant.id};
}
