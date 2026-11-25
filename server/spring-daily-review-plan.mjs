import {springPendingArrival} from './spring-daily-plan.mjs';

// A complete inventory is still classified/accounted for. Daily image work is
// limited to the changed offers and genuinely unverified arrivals; previously
// inspected, unchanged native bytes keep their actual evidence dates.
export function springDailyReviewProducts(source,{mode=process.env.SPRING_MODE}={}){
 const all=source.products||[];
 if(mode!=='daily')return all;
 const plan=source.dailyPlan;
 if(!source.source?.complete||source.source.expected!==all.length||plan?.observedAt!==source.observedAt||plan.sourceProducts!==all.length||!Array.isArray(plan.detailSkus))throw Error('Complete current Spring daily image plan required');
 const known=new Set(all.map(p=>String(p.sku))),selected=new Set(plan.detailSkus.map(String));
 if(selected.size!==plan.detailSkus.length||[...selected].some(s=>!known.has(s)))throw Error('Spring daily image plan contains duplicate or unknown SKUs');
 return all.filter(p=>selected.has(String(p.sku))||springPendingArrival(p)||!p.springAudit);
}
