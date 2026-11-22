import fs from 'node:fs/promises';
import {atomicJson} from './sync.mjs';
import {readLedger,periodKey,runKey,budgetError} from './credit-budget.mjs';
import {loadUncappedCreditGrants} from './credit-scope.mjs';
import {normalizeCollectionLimits,initialCreditReservation,unrestrictedCollection} from './collection-limits.mjs';

// The user approved unlimited free-failed native images separately. Ordinary
// source collection retains separate authorisation; gross billing never changes.
export async function reserveNativeImageCredits(policy,{accountRemaining,now=Date.now(),key=runKey()}={}){
 policy=normalizeCollectionLimits(policy);
 const grants=await loadUncappedCreditGrants(),grant=grants.find(g=>g.scope==='failed-native-originals-all-retailers');if(!grant)throw Error('Enabled all-retailer free-first native image approval required');
 const ledger=await readLedger(),period=periodKey(now),p=ledger.periods[period]||={used:0,reservations:{}};p.reservations||={};
 const prior=p.reservations[key];if(prior){if(prior.authorizationId!==grant.id)throw Error('Native image reservation scope mismatch');return{ledger,period,key,limit:prior.amount,grant};}
 const held=unrestrictedCollection(policy)?Object.values(p.reservations).reduce((n,r)=>n+Math.max(0,r.amount-(r.creditsBilled||0)),0):0;
 const limit=Math.floor(Math.min(initialCreditReservation(policy),accountRemaining-policy.accountReserveCredits-held));if(!Number.isFinite(limit)||limit<(unrestrictedCollection(policy)?1:2))throw budgetError('Native image account balance/reserve or per-run budget unavailable');
 p.reservations[key]={amount:limit,createdAt:new Date(now).toISOString(),authorizationId:grant.id,scope:grant.scope,ordinaryCatalogueCredits:false};await atomicJson('web/collection-ledger.json',ledger);return{ledger,period,key,limit,grant};
}
