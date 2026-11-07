export function monitorLabel(m){
 const labels={error:'最近检查未完成 · Last check incomplete',checking:'检查中 · Checking','delivery-pending':'新品等待投递 · Delivery pending','delivery-waiting':'投递等待限次重试 · Delivery retry scheduled','delivery-blocked':'部分投递已隔离，其他商品继续 · Some deliveries isolated; others continue'};
 const label=labels[m.state]||'每日计划已启用 · Daily schedule active';
 return label+(m.pendingDeliveries?' · 待发 · Pending: '+Number(m.pendingDeliveries):'')+(m.blockedDeliveries?' · 异常 · Blocked: '+Number(m.blockedDeliveries):'');
}
