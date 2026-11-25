import{isToday}from'../web/catalogue-model.mjs';
import{productKey,nativeSourceUrl}from'../web/product-facts.mjs';

// Prepare current arrivals across every department before a large early
// department can use the shared native-byte allowance. Then give each
// department its own first product before filling the remaining slots.
export function browseNativePriorityOrder(scopes){
 const rows=[...scopes.flatMap(s=>s.products.filter(p=>isToday(p)).slice(0,6)),...scopes.flatMap(s=>s.products.slice(0,1))],seen=new Set();
 return rows.filter(p=>{const source=nativeSourceUrl(p);if(!source)return false;const key=productKey(p)+' '+source;if(seen.has(key))return false;seen.add(key);return true;});
}
