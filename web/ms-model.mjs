export const MS_DEPARTMENTS=[['ms-baubles','圣诞球','Christmas Baubles'],['ms-lights','圣诞彩灯','Christmas Lights'],['ms-garland','圣诞长藤','Christmas Garlands'],['ms-wreath','圣诞圈','Christmas Wreaths'],['ms-stockings','圣诞袜','Christmas Stockings'],['ms-tree','圣诞树','Christmas Trees']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'ms'}));
export const isMsScope=id=>MS_DEPARTMENTS.some(d=>d.id===id);
export const MS_SOURCES=[['ms-baubles','christmas-decorations/christmas-baubles'],['ms-lights','christmas-decorations/christmas-lights'],['ms-garland','christmas-decorations/christmas-garlands'],['ms-wreath','christmas-decorations/christmas-wreaths'],['ms-stockings','christmas-stockings'],['ms-tree','christmas-trees']].map(([id,path])=>({id,url:'https://www.marksandspencer.com/l/christmas/'+path}));
// Preserve official Baubles membership for novelty hanging ornaments too;
// their actual object shape is stated separately, never labelled spherical.
export function msMemberships(p){
 const title=String(p.baseName||p.variantName||'').toLowerCase(),description=String(p.sourceDescription||'').toLowerCase(),native=(p.msSource?.categoryIds||[]).filter(isMsScope);let primary;
 if(/\b(?:stockings?|christmas sacks?)\b/.test(title)&&!/stocking (?:holder|hanger|filler)/.test(title))primary='ms-stockings';
 else if(/\bgarlands?\b/.test(title)&&!/garland (?:string )?lights/.test(title))primary='ms-garland';
 else if(/\bwreaths?\b/.test(title)&&!/wreath (?:hanger|hook|holder)|bauble|tree decoration|hanging ornament/.test(title))primary='ms-wreath';
 else if(/\b(?:string|fairy|cluster|icicle|net|tree|curtain|christmas) lights?\b|\blight strings?\b/.test(title))primary='ms-lights';
 else if(native.includes('ms-tree')&&!/\b(?:decoration|ornament|bauble|topper|skirt|collar|stand|storage)\b/.test(title))primary='ms-tree';
 else if(native.includes('ms-baubles'))primary='ms-baubles';
 else if(native.includes('ms-lights'))primary='ms-lights';
 else primary=native[0]||null;
 const shape=primary==='ms-baubles'?(/\bbaubles?\b/.test(title)?'圣诞球／球套装 · Bauble / bauble set':'异形树挂饰 · Novelty tree ornament'):null;
 return {primary,memberships:primary?[primary]:[],nativeMemberships:native,shape,method:'M&S-native-category-exact-SKU-description-and-image',descriptionChecked:Boolean(description)};
}
