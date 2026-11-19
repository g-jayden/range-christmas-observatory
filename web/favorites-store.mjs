import {productKey,productRetailer} from './product-facts.mjs';
const KEY='observatory-favorites-v1',listeners=new Set();let current;
function read(){try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value:[];}catch{return[];}}
export const favoriteProducts=()=>current??=(read());
export const isFavorite=p=>favoriteProducts().some(x=>productKey(x)===productKey(p));
export function saveFavorites(products){const unique=[...new Map(products.map(p=>[productKey(p),p])).values()];localStorage.setItem(KEY,JSON.stringify(unique));current=unique;for(const fn of listeners)fn(unique);}
export function toggleFavorite(p){const key=productKey(p),rows=favoriteProducts(),exists=rows.some(x=>productKey(x)===key);saveFavorites(exists?rows.filter(x=>productKey(x)!==key):[...rows,{...p,favoritedAt:new Date().toISOString()}]);return!exists;}
export const onFavoritesChange=fn=>(listeners.add(fn),()=>listeners.delete(fn));
export function removeFavorites(keys){const selected=new Set(keys);saveFavorites(favoriteProducts().filter(p=>!selected.has(productKey(p))));}
export function clearFavorites(){saveFavorites([]);}
if(typeof window!=='undefined')window.addEventListener('storage',e=>{if(e.key===KEY){current=read();for(const fn of listeners)fn(current);}});

export function reconcileFavoriteIdentities(index){const previous=favoriteProducts(),rows=previous.map(p=>({...p,canonicalSku:index.canonical?.[productRetailer(p)+':'+p.sku]||String(p.sku)}));if(JSON.stringify(rows)!==JSON.stringify(previous))saveFavorites(rows);}
