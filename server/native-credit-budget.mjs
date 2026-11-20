import fs from 'node:fs/promises';
import {atomicJson} from './sync.mjs';
import {readLedger,periodKey,runKey,budgetError} from './credit-budget.mjs';
import {loadUncappedCreditGrants} from './credit-scope.mjs';

// The user approved unlimited free-failed native images separately. Ordinary
// source catalogues retain their own monthly cap; gross billing never changes.
export async function reserveNativeImageCredits(policy,{accountRemaining,now=Date.now(),key=runKey()}={}){
 const grants=await loadUncappedCreditGrants(),grant=grants.find(g=>g.scope==='failed-native-originals-all-retailers');if(!grant)throw Error('Enabled all-retailer free-first native image approval required');
 const ledger=await readLedger(),period=periodKey(now),p=ledger.periods[period]||={used:0,reservations:{}};p.reservations||={};
 const prior=p.reservations[key];if(prior){if(prior.authorizationId!==grant.id)throw Error('Native image reservation scope mismatch');return{ledger,period,key,limit:prior.amount,grant};}
 const limit=Math.floor(Math.min(policy.maxCreditsPerRun,accountRemaining-policy.accountReserveCredits));if(!Number.isFinite(limit)||limit<2)throw budgetError('Native image account reserve or per-run budget unavailable');
 p.reservations[key]={amount:limit,createdAt:new Date(now).toISOString(),authorizationId:grant.id,scope:grant.scope,ordinaryCatalogueCredits:false};await atomicJson('web/collection-ledger.json',ledger);return{ledger,period,key,limit,grant};
}
