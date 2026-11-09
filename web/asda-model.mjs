import {offeredObject} from './taxonomy.mjs';
export const ASDA_DEPARTMENTS=[['asda-tree','圣诞树','Christmas Trees'],['asda-tree-decorations','圣诞树装饰品','Christmas Tree Decorations'],['asda-lights','圣诞灯','Christmas Lights'],['asda-room','圣诞节房间装饰','Christmas Room Decorations'],['asda-wreath','圣诞圈','Christmas Wreaths'],['asda-garland','圣诞节长藤','Christmas Garlands'],['asda-outdoor','户外圣诞装饰品','Outdoor Decorations']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'asda',...(id==='asda-lights'?{charts:false}:{})}));
export const isAsdaScope=id=>ASDA_DEPARTMENTS.some(d=>d.id===id);
export const retailerProductKey=p=>(p.retailerId==='asda'?'asda:':'the-range:')+String(p.sku);
export function asdaMemberships(p){
 const title=String(p.variantName||p.name||'').toLowerCase(),body=String(p.sourceDescription||'').toLowerCase(),spec=p.specifications||{},category=p.asdaSource?.primaryCategoryID||'',type=String(p.asdaSource?.customType||'').toLowerCase();let primary;const physical=offeredObject({...p,kind:category==='D18M2G1C4'?'tree':'decoration'});
 const smallHanging=/\bbaubles?\b|\btree toppers?\b|hanging (?:tree |christmas )?(?:decoration|ornament)|\btinsel\b(?!.*\btree\b)/.test(title);
 if(/\bwreath (?:hanger|hook)|\bstocking|christmas sack|\badvent calendar|\b(?:name |place ?card )?placeholders?\b|\bchair d[eé]cor|\bnapkin rings?\b/.test(title))primary='asda-room';
 else if(/\btree (?:skirt|collar|stand|base|storage bag)\b/.test(title))primary='asda-tree-decorations';
 else if(/\b(?:houses|churches|cottages)\b/.test(title)&&!/\b(?:baubles?|hanging|garland|lights string|string lights)\b/.test(title))primary='asda-room';
 else if(/\b(?:hydrangea|poinsettia|rose|flower|floral)\b/.test(title)&&/\bclips?\b/.test(title))primary='asda-tree-decorations';
 else if(category==='D18M2G1C3'&&!/\b(?:baubles?|tree (?:ornament|decoration|topper))\b/.test(title))primary=physical.id==='scenes'?'asda-room':'asda-lights';
 else if(/\bgarland (?:string )?lights\b/.test(title))primary='asda-lights';
 else if(physical.id==='scenes'||['accessory','craft-kit'].includes(physical.subtype))primary='asda-room';
 else if(/\bwreaths?\b/.test(title)&&!/\b(?:baubles?|kit|craft|tree (?:decoration|ornament)|wreath shaped hanging|wreath hanging decoration)\b/.test(title))primary='asda-wreath';
 else if(physical.id==='tree-decorations')primary='asda-tree-decorations';
 else if(category==='D18M2G1C2'&&!/\bdoor\b/.test(title+' '+body))primary='asda-tree-decorations';
 else if(smallHanging&&!/\bgarland\b/.test(title))primary='asda-tree-decorations';
 else if(/\bgarlands?\b/.test(title))primary='asda-garland';
 else if(/\bwreaths?\b/.test(title))primary='asda-wreath';
 else if(category==='D18M2G1C4'||/^(?:pre[ -]?lit|unlit) tree$/.test(type))primary='asda-tree';
 else if(category==='D18M2G1C2')primary='asda-tree-decorations';
 else if(category==='D18M2G1C3'||/\b(?:christmas|string|cluster|icicle|curtain|fairy|net|rope|tree) lights?\b/.test(title))primary='asda-lights';
 else primary='asda-room';
 const use=String(spec['Indoor / Outdoor']||'').toLowerCase();
 // Indoor-only is stronger than outdoor styling in a photograph.
 const outdoor=!/indoor only/.test(use)&&(/outdoor|\bboth\b/.test(use)||/\boutdoor\b/.test(title)||/suitable for (?:indoor and |indoor\/)?outdoor/.test(body));
 if(outdoor&&(/outdoor only/.test(use)||physical.id==='inflatable'))primary='asda-outdoor';
 const ids=[primary];if(outdoor)ids.push('asda-outdoor');
 return {primary,memberships:[...new Set(ids)],method:'ASDA-exact-SKU-object-description-image',nativeCategory:category,offeredObjectReason:physical.reason};
}
