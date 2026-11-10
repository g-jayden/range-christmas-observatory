export const BM_DEPARTMENTS=[['bm-tree','圣诞树','Christmas Trees'],['bm-baubles','圣诞彩球与树装饰品','Christmas Baubles & Tree Decorations'],['bm-lights','圣诞灯','Christmas Lights'],['bm-wreath','圣诞圈','Christmas Wreaths'],['bm-garland','圣诞长藤','Christmas Garlands'],['bm-outdoor','户外圣诞装饰品','Outdoor Decorations']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'bm'}));
export const isBmScope=id=>BM_DEPARTMENTS.some(d=>d.id===id);
export function bmMemberships(p){
 const title=String(p.baseName||p.variantName||'').toLowerCase(),type=String(p.specifications?.Type||'').toLowerCase(),groups=p.bmSource?.groups||[],memberships=[];let primary=null;
 const outside=/\btree skirts?\b|\bchocolate tree decorations?\b/.test(title)||/\b(?:halloween|autumn|easter|spring|harvest)\b/.test(title)||/\bwreath (?:door )?(?:hook|hanger|holder)\b|\b(?:tree|garland) (?:storage|bag|stand|clips?|hooks?)\b/.test(title);
 if(outside)return {primary:null,memberships:[],disposition:'exclude',reason:'非指定圣诞商品本体或安装附件 · Outside Christmas scope or installation accessory'};
 if(/\btinsel\b/.test(title))primary='bm-garland';
 else if(groups.includes('baubles'))primary='bm-baubles';
 else if(/\b(?:garlands?|tinsel)\b/.test(title))primary='bm-garland';
 else if(/\bwreaths?\b/.test(title))primary='bm-wreath';
 else if(groups.includes('trees')&&!/\b(?:tree lights?|topper|hanging|decoration pack)\b/.test(title))primary='bm-tree';
 else if(groups.includes('lights'))primary='bm-lights';
 else if(groups.includes('outdoor'))primary='bm-outdoor';
 else if(groups.includes('wreaths-garlands')&&/foliage/.test(title)&&/heart|star/.test(title))primary='bm-wreath';
 if(primary)memberships.push(primary);
 if(groups.includes('outdoor')&&!memberships.includes('bm-outdoor'))memberships.push('bm-outdoor');
 return {primary:primary||memberships[0]||null,memberships,method:'B&M-exact-product-record-type-description-and-image',descriptionChecked:Boolean(p.sourceDescription)};
}
