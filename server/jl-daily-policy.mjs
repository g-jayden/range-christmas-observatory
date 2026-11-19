export function johnLewisDailyPolicy(grant){
 if(grant?.retailerId!=='jl'||grant.enabled!==true||grant.scheduledPaidCollection!==true||grant.scope!=='ongoing-seven-category-collection'||grant.maxCreditsPerRun!==null||grant.monthlyCreditsLimit!==null)throw Error('Ongoing John Lewis paid collection is not authorised');
 if(!Number.isInteger(grant.accountReserveCredits)||grant.accountReserveCredits<5000)throw Error('Invalid John Lewis account reserve');
 return {authorizationId:grant.id,retailerId:'jl',freeFirst:true,maxCreditsPerRun:Infinity,monthlyLimit:null,accountReserveCredits:grant.accountReserveCredits};
}
