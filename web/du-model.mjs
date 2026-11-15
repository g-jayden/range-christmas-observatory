export const DU_DEPARTMENTS=[['du-tree','圣诞树','Christmas Trees'],['du-skirt','圣诞树裙','Christmas Tree Skirts'],['du-baubles','圣诞球和圣诞树装饰品','Baubles & Tree Decorations'],['du-lights','圣诞彩灯','Christmas Lights'],['du-garland','圣诞长藤','Christmas Garlands'],['du-wreath','圣诞圈','Christmas Wreaths']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'du'}));
export const isDuScope=id=>DU_DEPARTMENTS.some(d=>d.id===id);
export function duMemberships(p){
 const title=String(p.baseName||p.variantName||'').toLowerCase(),type=String(p.duSource?.type||'').toLowerCase(),groups=p.duSource?.groups||[],description=String(p.sourceDescription||'').toLowerCase();let primary=null;
 const outside=/\b(?:halloween|autumn(?:al)?|easter|spring|harvest|summer|sunflower|daisy|tulip|lavender)\b/.test(title)||/\b(?:diffuser|fragrance|reeds|candle holder|candle ring|wreath hanger|wreath hook|hooks?|decorating clips|storage|tree stand|watering|replacement bulb|battery pack|extension cable|cushion|bedding|door mat|napkin|tablecloth|wallpaper|wrapping|stockings?|snowglobe|paper fans|folding paper stars|sitting santa|laying deer|sign hanger)\b/.test(title)||/\b(?:swag|teardrop)\b/.test(title)||/home fragrance|candles.*diffusers/.test(type);
 if(outside)return {primary:null,memberships:[],disposition:'exclude',reason:'非指定圣诞商品本体、其他季节或安装附件 · Outside requested Christmas physical categories, other season or accessory'};
 if(/\btree (?:skirt|collar)\b/.test(title)||groups.includes('skirts')&&/skirt|collar/.test(description))primary='du-skirt';
 else if((groups.includes('trees')||/artificial (?:mirrorball potted christmas|cone) tree/.test(title))&&/\btrees?\b/.test(title)&&!/\b(?:ornaments?|hanging|topper|decoration|neon)\b/.test(title))primary='du-tree';
 else if(groups.includes('lights')&&!/\bwreath\b/.test(title))primary='du-lights';
 else if(/\bwreath\b/.test(title)&&/\b(?:doors?|walls?)\b/.test(description))primary='du-wreath';
 else if(groups.includes('baubles')&&/\btinsel.*pendant\b/.test(title))primary='du-baubles';
 else if(groups.includes('baubles')&&/\b(?:baubles?|hanging|ornaments?|topper|clip|bows?|tree decorations?)\b/.test(title)&&!/\b(?:garland|tinsel)\b/.test(title))primary='du-baubles';
 else if(/\b(?:garlands?|tinsel)\b/.test(title))primary='du-garland';
 else if(/\bwreath\b/.test(title))primary='du-wreath';
 else if(groups.includes('lights'))primary='du-lights';
 else if(groups.includes('baubles'))primary='du-baubles';
 const memberships=/wreath\s*(?:&|and)\s*garland\s*set/.test(title)?['du-wreath','du-garland']:primary?[primary]:[];
 return {primary:memberships[0]||primary,memberships,method:'Dunelm-exact-SKU-physical-object-description-and-source-photo',descriptionChecked:Boolean(p.sourceDescription)};
}
