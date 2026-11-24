// Native bindings contain both string keys and exact-SKU/gallery objects.
// Set compares objects by reference; checkpoint JSON round-trips make every
// copy distinct and can double the index on every save. Deduplicate by value.
function canonical(value){
 if(value===null||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(canonical);
 return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
}
export function mergeNativeBindings(...lists){
 const unique=new Map();for(const list of lists){if(list===undefined)continue;if(!Array.isArray(list))throw Error('Native bindings must be arrays');for(const value of list){if(typeof value!=='string'&&(!value||Array.isArray(value)||typeof value!=='object'))throw Error('Invalid native binding');const key=JSON.stringify(canonical(value));if(!unique.has(key))unique.set(key,value);}}
 return [...unique.keys()].sort().map(key=>unique.get(key));
}
export function compactNativeEntries(entries={}){
 return Object.fromEntries(Object.entries(entries).map(([url,e])=>{if(!e?.bindings)return[url,e];const bindings=mergeNativeBindings(e.bindings);return[url,bindings.length===e.bindings.length?e:{...e,bindings}];}));
}
