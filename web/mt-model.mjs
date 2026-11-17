export const MT_DEPARTMENTS=[['mt-baubles','圣诞树装饰与圣诞球','Christmas Tree Decorations & Baubles'],['mt-wreath','圣诞圈','Christmas Wreaths'],['mt-garland','圣诞长藤','Christmas Garlands'],['mt-tree','圣诞树','Christmas Trees'],['mt-skirt','圣诞树裙','Christmas Tree Skirts'],['mt-inflatables','充气圣诞装饰','Inflatable Christmas Decorations'],['mt-outdoor','户外圣诞装饰','Outdoor Christmas Decorations']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'mt'}));
export const isMtScope=id=>MT_DEPARTMENTS.some(d=>d.id===id);
export function mtMemberships(p){const name=String(p.baseName||p.variantName||'').toLowerCase(),description=String(p.sourceDescription||'').toLowerCase(),groups=p.mtSource?.groups||[],has=s=>groups.includes(s),decoration=/decoration|ornament|bauble|tree topper|hanging|clip/.test(name);let id=null;
 if(/halloween|easter|spring wreath|autumn wreath|harvest wreath/.test(name))return {primary:null,memberships:[],reason:'非指定圣诞商品 · Outside Christmas scope'};
 if(/tree (?:skirt|collar)|tree stand cover/.test(name))id='mt-skirt';
 else if(/inflatable|airblown/.test(name)||has('inflatables'))id='mt-inflatables';
 else if(/swag/.test(name))id=null;
 else if(/\btrees?\b/.test(name)&&!/(?:tree (?:topper|skirt|collar|decoration|garland|light))|storage|bag|hook|hanging|bauble|ornament|silhouette|pathway|stake/.test(name)&&(has('trees')||/christmas trees?/.test(name)))id='mt-tree';
 else if(/garland|\btinsel\b/.test(name)&&!/silhouette|santa|snowman|penguin|nutcracker|nativity|reindeer|rope light/.test(name)&&!/wreath and garland|wreath.*set/.test(name))id='mt-garland';
 else if(/wreath/.test(name)&&!/(?:hanging|mini).*decoration|ornament|hook|hanger|storage|bag|kit/.test(name))id='mt-wreath';
 else if(has('foliage')&&/wreath/.test(name)&&!/mini|hanging.*decoration|ornament|bauble|kit|hook|hanger/.test(name))id='mt-wreath';
 else if(!/tree topper|tree skirt|tree collar|storage|bag|hook|stand only|hanging|bauble|ornament|silhouette/.test(name)&&/christmas tree/.test(name)&&(has('trees')||/pine|fir|spruce|artificial|hinged/.test(name)))id='mt-tree';
 else if(has('baubles')||/tree decoration|bauble|tree topper/.test(name)||/wreath/.test(name)&&decoration)id='mt-baubles';
 else if((has('outdoor')||/outdoor|garden|weatherproof|ip44|ip65/.test(description)&&/rope light|silhouette|outdoor|display/.test(name))&&!/indoor use only/.test(description))id='mt-outdoor';
 return {primary:id,memberships:id?[id]:[],method:'Matalan-exact-variant-title-description-physical-object',...(!id?{reason:'官网关联的非指定商品，保留来源但不计入统计 · Related source product outside the seven requested physical categories'}:{})};}
