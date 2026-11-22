// Activation remains separate from complete official-source and image evidence.
export const AR_DEPARTMENTS=[['ar-tree','圣诞树','Christmas Trees'],['ar-baubles','圣诞装饰球','Christmas Baubles'],['ar-tree-decorations','圣诞树装饰','Christmas Tree Decorations'],['ar-wreath','圣诞圈','Christmas Wreaths'],['ar-garland','圣诞长藤','Christmas Garlands'],['ar-inflatables','充气圣诞装饰','Christmas Inflatables'],['ar-skirt-stand','圣诞树裙与底座','Christmas Tree Skirts & Stands']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'ar'}));
export const isArScope=id=>AR_DEPARTMENTS.some(d=>d.id===id);
export function arMemberships(p){
 const title=String(p.baseName||p.variantName||'').replace(/^Christmas Tree World\s+/i,'').toLowerCase(),prefix=title.split(/\b(?:with|for|including)\b/)[0],objects=/\b(?:trees?|skirts?|collars?|stands?|baubles?|ornaments?|decorations?|garlands?|wreaths?|tinsel|bows?|ribbons?|inflatables?|lights?|swags?|picks?)\b/,head=objects.test(prefix)?prefix:title,body=String(p.sourceDescription||'').toLowerCase(),groups=p.arSource?.groups||[],no=reason=>({primary:null,memberships:[],reason}),yes=part=>({primary:'ar-'+part,memberships:['ar-'+part],method:'exact-Argos-SKU-offered-object-description-and-official-membership'});
 if(/\b(?:halloween|easter|spring|autumn(?:al)?|harvest|birthday|christening|hawaiian|st george|england flag|ireland flag)\b/.test(title)||/\b(?:halloween|spring and summer|springtime|summertime|autumn(?:al)?|fall-coloured|occasion:\s*(?:autumn|easter|party))\b/.test(body))return no('非圣诞季节商品 · Outside Christmas season');
 if(!/\b(?:christmas|festive|xmas|noel|winter)\b/.test(title+' '+body.replace(/christmas tree world/ig,''))&&/\b(?:flowers?|florals?|lavender|peony|wisteria|gypsophila|tropical|hydrangea)\b/.test(title))return no('非圣诞花卉装饰 · Floral product without Christmas-season evidence');
 if(/\b(?:storage|wrapping paper|gift bags?|floating candles|bedding|duvet|cushions?|tablecloths?|wreath hangers?|wreath hooks?|wreath holders?|electric (?:air )?pumps?|tree bags?|replacement branches|garland ties)\b/.test(head))return no('非指定商品本体 · Outside requested physical products');
 if(/\b(?:inside glass bauble|glass bauble)\b/.test(head))return yes('baubles');
 if(/\bscentsicles\b/.test(head))return yes('tree-decorations');
 if(/\b(?:inflatable|airblown|blow.?up|self.?inflating)\b/.test(head)||groups.includes('inflatables-search')&&/\b(?:air.?filled|inflate|blower)\b/.test(body))return yes('inflatables');
 if(/\btree (?:skirts?|collars?|stand covers?|stands?)\b/.test(head))return yes('skirt-stand');
 if(/\b(?:tree lights?|light strings?|string lights?|fairy lights?)\b/.test(head)&&!/\b(?:pre.?lit|twig|birch|palm|cone)\b/.test(head))return no('独立灯串不属于本次七类 · Separate string lights outside the seven requested departments');
 if(/\b(?:tabletop|standing table|centrepiece|candle holder|swag|christmas pick)\b/.test(head))return no('桌面摆件、烛台、壁挂与单枝不属于本次七类 · Physical object outside the seven requested departments');
 if(/\b(?:garlands?|tinsel)\b/.test(head)&&(!/\bwreaths?\b/.test(head)||head.search(/\b(?:garlands?|tinsel)\b/)<head.search(/\bwreaths?\b/)))return yes('garland');
 if(/\bwreaths?\b/.test(head)){if((p.dimensions?.maxCm||100)<25&&/hanging decoration|ornament|christmas tree/.test(title+' '+body))return yes('tree-decorations');return yes('wreath');}
 if(/\bbaubles?\b/.test(head)||/\b(?:christmas|tree) balls?\b/.test(head))return yes('baubles');
 if(/\b(?:tree toppers?|tree top |treetop|tree decorations?|tree ornaments?|decorative clips?|bows?|ribbons?)\b/.test(head))return yes('tree-decorations');
 if(groups.includes('tree-decorations')&&/\b(?:hanging|ornament)\b/.test(head)&&!/\b(?:large|giant|standing|table|model|house)\b/.test(head))return yes('tree-decorations');
 if(/\b(?:snowman|reindeer|nutcracker|sleigh|santa)\b/.test(head))return no('人物或场景摆件，不是圣诞树本体 · Figure or scene outside requested physical classes');
 if(/\btrees?\b/.test(head)&&(groups.includes('tree')||/\b(?:artificial|christmas|xmas|fir|pine|spruce|birch|twig|pyramid)\b/.test(head))&&!/\b(?:ornaments?|skirt|collar|topper|storage|stand only|glass|resin|ceramic)\b/.test(head))return yes('tree');
 if(groups.includes('tree-decorations')&&/hang|loop|tree branch|bauble hook/.test(body)&&!/tabletop|freestanding|standing figure/.test(head))return yes('tree-decorations');
 return no('官网关联的非指定商品；保留来源 · Related official product outside the requested physical categories');
}
