export const BQ_DEPARTMENTS=[['bq-tree','圣诞树','Christmas Trees'],['bq-baubles','圣诞装饰球','Christmas Baubles'],['bq-tree-decorations','圣诞树装饰','Christmas Tree Decorations'],['bq-wreath','圣诞圈','Christmas Wreaths'],['bq-garland','圣诞长藤','Christmas Garlands'],['bq-skirt','圣诞树裙','Christmas Tree Skirts'],['bq-standing','圣诞节立式装饰品','Christmas Standing Decorations'],['bq-inflatables','充气圣诞装饰','Christmas Inflatables'],['bq-hanging','圣诞悬挂装饰','Christmas Hanging Decorations'],['bq-topper','圣诞树顶装饰','Christmas Tree Toppers']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'bq'}));
export const isBqScope=id=>BQ_DEPARTMENTS.some(d=>d.id===id);
export function bqMemberships(p){const name=String(p.baseName||p.variantName||'').toLowerCase(),desc=String(p.sourceDescription||'').toLowerCase(),groups=p.bqSource?.groups||[],has=s=>groups.includes(s);let id=null;
 if(/halloween|easter|spring wreath|autumn wreath|harvest wreath/.test(name))return{primary:null,memberships:[],reason:'非指定圣诞商品 · Outside Christmas scope'};
 if(/tree (?:skirt|collar)|tree stand cover/.test(name))id='bq-skirt';
 else if(/inflatable|airblown/.test(name)||has('inflatables')&&/air.?filled|inflate/.test(desc))id='bq-inflatables';
 else if(/tree topper|top of (?:the |your )?tree/.test(name+' '+desc)&&!/storage|bag|hook|hanger/.test(name))id='bq-topper';
 else if(/garland|tinsel/.test(name)&&!/wreath.*garland.*set|wreath and garland/.test(name))id='bq-garland';
 else if(/wreath/.test(name)&&!/(?:hanging|mini).*decoration|ornament|hook|hanger|storage|bag|kit/.test(name)&&has('wreath'))id='bq-wreath';
 else if(/\bbaubles?\b/.test(name)&&!/storage|bag|hook|hanger/.test(name))id='bq-baubles';
 else if(/christmas tree/.test(name)&&!(/tree topper|tree skirt|tree collar|storage|bag|hook|stand only|stand for|hanging|bauble|ornament|decoration|light string/.test(name))&&has('tree'))id='bq-tree';
 else if(has('tree-decorations')&&!has('hanging')||/tree (?:hanging )?decoration|hanging (?:tree )?ornament/.test(name+' '+desc))id='bq-tree-decorations';
 else if(has('standing')&&!/storage|hook|hanger/.test(name))id='bq-standing';
 else if(has('hanging')&&!/hook|hanger|storage/.test(name))id='bq-hanging';
 return{primary:id,memberships:id?[id]:[],method:'B&Q-unique-EAN-physical-product-title-description-source-scopes',...(!id?{reason:'官网关联的非指定商品，保留来源但不计入统计 · Related source product outside requested physical classes'}:{})};}
