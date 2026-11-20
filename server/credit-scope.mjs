import fs from 'node:fs/promises';

// An unlimited retailer or native-image grant does not increase the ordinary
// catalogue allowance. Keep gross billing intact and index only its exact,
// independently authorised receipts, including after the recent-run list trims.
const definitions=[
 ['next-collection-authorization.json','nx','ongoing-five-category-collection'],
 ['jl-collection-authorization.json','jl','ongoing-seven-category-collection'],
 ['argos-collection-authorization.json','ar','ongoing-seven-category-collection'],
 ['image-collection-authorization.json',null,'failed-native-originals-all-retailers']
];
export async function loadUncappedCreditGrants(root='web'){
 const grants=[];
 for(const[file,retailerId,scope]of definitions){let grant;try{grant=JSON.parse(await fs.readFile(root+'/'+file,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(grant.enabled!==true||grant.scope!==scope||typeof grant.id!=='string'||!grant.id||!Number.isFinite(grant.accountReserveCredits??5000)||(grant.accountReserveCredits??5000)<5000)continue;
  if(retailerId?(grant.retailerId!==retailerId||grant.scheduledPaidCollection!==true||grant.monthlyCreditsLimit!==null):(grant.freeFirst!==true||grant.maxCredits!==null))continue;
  if(!Number.isFinite(Date.parse(grant.authorizedAt)))continue;
  grants.push({id:grant.id,retailerId,scope,authorizedAt:grant.authorizedAt});
 }
 return grants;
}
export function indexUncappedCreditReceipts(period,grants){
 for(const run of period.runs||[]){const r=run.receipt,g=grants.find(g=>g.id===r?.authorizationId);if(!g||typeof r.id!=='string'||!r.id||!Number.isFinite(run.credits)||run.credits<0||run.credits!==r.credits)continue;
  if(g.retailerId?r.retailerId!==g.retailerId:!String(r.id).startsWith('native-session-'))continue;
  if(!Number.isFinite(Date.parse(run.completedAt||r.completedAt))||Date.parse(run.completedAt||r.completedAt)<Date.parse(g.authorizedAt))continue;
  const value={receiptId:String(r.id),credits:run.credits,authorizationId:g.id,scope:g.scope},prior=period.uncappedReceipts?.[r.id];
  if(prior&&(prior.credits!==value.credits||prior.authorizationId!==value.authorizationId||prior.scope!==value.scope))throw Error('Conflicting authorised credit receipt');
  period.uncappedReceipts||={};period.uncappedReceipts[r.id]=value;
 }
 return ordinaryCreditUsage(period);
}
export function ordinaryCreditUsage(period){
 if(!Number.isFinite(period.used)||period.used<0)throw Error('Invalid gross Firecrawl billing total');
 let uncapped=0;for(const[id,r]of Object.entries(period.uncappedReceipts||{})){if(r.receiptId!==id||!Number.isFinite(r.credits)||r.credits<0||!r.authorizationId||!r.scope)throw Error('Invalid scoped Firecrawl billing evidence');uncapped+=r.credits;}
 if(uncapped>period.used)throw Error('Scoped Firecrawl receipts exceed gross billing');
 return{gross:period.used,uncapped,ordinary:period.used-uncapped};
}

export function indexScopedNativeReservations(ledger,evidence,grants){for(const proof of evidence||[]){const r=ledger.periods?.[proof.period]?.reservations?.[proof.key],grant=grants.find(g=>g.id===proof.authorizationId&&g.scope==='failed-native-originals-all-retailers');if(!r||!grant||proof.scope!==grant.scope||proof.workflow!=='.github/workflows/range-native.yml'||proof.workflowUrl!=='https://github.com/g-jayden/range-christmas-observatory/actions/runs/'+proof.workflowRunId||String(proof.workflowRunId)!==proof.key.split('-')[0]||r.amount!==proof.amount||r.createdAt!==proof.createdAt||r.uncertainBilling!==true||Date.parse(r.createdAt)<Date.parse(grant.authorizedAt))continue;r.authorizationId=grant.id;r.scope=grant.scope;r.ordinaryCatalogueCredits=false;r.scopeEvidence=proof.workflowUrl;}}
export function ordinaryReservationTotal(period,grants){return Object.values(period.reservations||{}).reduce((n,r)=>{if(!Number.isFinite(r.amount)||r.amount<0)throw Error('Invalid source credit reservation');const native=r.ordinaryCatalogueCredits===false&&r.scope==='failed-native-originals-all-retailers'&&grants.some(g=>g.id===r.authorizationId&&g.scope===r.scope);return n+(native?0:r.amount);},0);}
