export const HB_DEPARTMENTS=[['hb-baubles','圣诞装饰球','Christmas Baubles'],['hb-outdoor','户外装饰','Outdoor Decorations'],['hb-hanging','圣诞节悬挂装饰品','Christmas Hanging Decorations'],['hb-inflatables','圣诞充气玩具','Christmas Inflatables'],['hb-standing','圣诞节立式装饰品','Christmas Standing Decorations'],['hb-tree-decorations','圣诞树装饰品','Christmas Tree Decorations'],['hb-wreath','圣诞圈','Christmas Wreathes'],['hb-garland','圣诞长藤','Christmas Garlands'],['hb-lights','圣诞彩灯','Christmas Lights']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'hb'}));
export const HB_SOURCE_CATEGORIES={'349':'hb-baubles','366':'hb-outdoor','365':'hb-hanging','993':'hb-inflatables','804':'hb-standing','112':'hb-tree-decorations','917':'hb-wreath','915':'hb-garland','111':'hb-lights'};
export const isHbScope=id=>HB_DEPARTMENTS.some(d=>d.id===id);
export function hbMemberships(p){
 const t=String(p.variantName||p.baseName||'').toLowerCase(),groups=p.hbSource?.groups||[],s=new Set(groups),memberships=[];let primary=null;
 if(/\b(?:halloween|autumn|harvest|easter|spring)\b|\b(?:tree skirt|stocking|gift sack|wreath hanger|wreath hook|storage bag|bauble hook|bauble wire|gutter hooks?|suction hooks?|chocolate)\b/.test(t))return {primary:null,memberships:[],disposition:'exclude',reason:'非指定九类商品本体 · Outside the nine requested physical categories'};
 if(s.has('hb-inflatables')||/\binflat(?:abl|ing)/.test(t)&&!/(?:deflat|inflatable)\s+(?:pump|repair)/.test(t))primary='hb-inflatables';
 else if(/\b(?:candle holders?|hurricane in wreath)\b/.test(t))primary='hb-standing';
 else if(/\b(?:swag|teardrop)\b|\btinsel (?:round )?lantern\b/.test(t))primary='hb-hanging';
 else if(s.has('hb-tree-decorations')&&/\b(?:hanging candy cane|large bell)\b/.test(t))primary='hb-tree-decorations';
 else if(/\bled\b.*\b(?:berry tree|twig tree|door arch)\b/.test(t))primary='hb-lights';
 else if(s.has('hb-baubles')||/\bbaubles?\b/.test(t))primary='hb-baubles';
 else if(/\b(?:garlands?|tinsel)\b/.test(t))primary='hb-garland';
 else if(s.has('hb-tree-decorations'))primary='hb-tree-decorations';
 else if(/\bwreath\b/.test(t)&&!(/\b(?:mini|hanging decoration|tree ornament|clip)\b/.test(t)&&p.dimensions?.maxCm<20))primary='hb-wreath';
 else if(s.has('hb-hanging'))primary='hb-hanging';
 else if(s.has('hb-standing'))primary='hb-standing';
 else if(s.has('hb-lights'))primary='hb-lights';
 else if(s.has('hb-garland'))primary='hb-garland';
 else if(s.has('hb-wreath'))primary='hb-wreath';
 else if(s.has('hb-outdoor'))primary='hb-outdoor';
 if(primary)memberships.push(primary);
 if(s.has('hb-outdoor')&&!memberships.includes('hb-outdoor'))memberships.push('hb-outdoor');
 return {primary,memberships,method:'Home-Bargains-official-departments-exact-variant-description-and-photo',descriptionChecked:Boolean(p.sourceDescription)};
}
