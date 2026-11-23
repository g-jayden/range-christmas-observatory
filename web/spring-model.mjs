export const SPRING_AVAILABLE=false;
export const SPRING_VERSION='range-spring-source-and-photo-v1';
export const SPRING_DEPARTMENTS=[
 {id:'spring-stems',zh:'花束／单枝',en:'Bouquets / Picks / Stems / Sprays'},
 {id:'spring-potted',zh:'绿植盆栽／花盆栽',en:'Potted Plants / Flowers'},
 {id:'spring-wreath-garland',zh:'长藤／圈',en:'Garlands / Wreaths'},
 {id:'spring-tree',zh:'仿真树',en:'Artificial Trees'}
].map(d=>({...d,collectionId:'spring',label:d.zh+' · '+d.en,charts:false}));
export const isSpringScope=id=>SPRING_DEPARTMENTS.some(d=>d.id===id);
export const collectionForScope=id=>isSpringScope(id)?'spring':'christmas';
const seasonWords=/\b(?:autumn(?:al)?|fall[ -](?:colou?r|foliage|wreath|garland)|halloween|harvest|thanksgiving|pumpkins?|christmas|xmas|festive|poinsettia|snowy|snow[ -]?(?:covered|flocked)|holly|mistletoe)\b/i;
const dried=/\b(?:dried|dried[ -]look|pampas|burnt orange|rust[ -]colou?red|copper[ -]foliage)\b/i;
// A botanical subject sold already arranged in a vase is included. An empty
// vase, planter, flower rack, live plant or craft component is not the object.
export function springSourceDecision(p){
 const title=String(p.variantName||p.name||''),description=String(p.sourceDescription||''),category=String(p.breadcrumb||p.productPath||''),text=title+' '+description;
 const seasonalIdentity=title+' '+String(p.specifications?.Season||p.specifications?.Occasion||'');if(seasonWords.test(seasonalIdentity))return{disposition:'exclude',reason:'explicit-non-spring-season',evidence:seasonalIdentity.match(seasonWords)[0]};
 const context=description.match(/\b(?:autumn(?:al)?|halloween|harvest|christmas)\s+(?:colou?rs?|foliage|leaves|wreath|garland|arrangement|bouquet|decoration)|\b(?:rust|burnt orange)\s+(?:leaves|foliage)\b/i);if(context)return{disposition:'exclude',reason:'description-identifies-non-spring-product',evidence:context[0]};
 if(dried.test(title))return{disposition:'exclude',reason:'dried-or-autumn-palette',evidence:title.match(dried)[0]};
 if(/\b(?:live|living|real)\s+(?:plants?|trees?|flowers?)|\b(?:seeds?|bulbs?)\s+(?:for|to)\s+(?:plant|grow)|\b(?:flower heads?|petal confetti|plant stand|vase filler|wall art|wall panels?|memorial vase|flower pots? holder)\b/i.test(title))return{disposition:'exclude',reason:'non-artificial-botanical-product',evidence:title};
 const foliage=/\b(?:artificial|faux|fake|silk|flower|floral|foliage|garland|wreath|stem|spray|bouquet|pick|tree|potted|plant|fern|orchid|rose|hydrangea|eucalyptus|tulip|daisy|peony|gypsophila|lavender|blossom)\b/i;
 if(/\b(?:vase|planter|pot|basket|urn|stand|frame|holder)\b/i.test(title)&&!(/\b(?:in|with)\b[\s\S]*\b(?:pot|vase|planter|basket)\b|\b(?:arrangement|potted|artificial|faux|fake|tree|fern|succulent|orchid|flowering)\b/i.test(title)))return{disposition:'exclude',reason:'empty-container-or-accessory',evidence:title};
 if(!foliage.test(title+' '+category))return{disposition:'review',reason:'botanical-object-unconfirmed',evidence:title};
 let department;
 if(/\b(?:garland|wreath|swag)\b/i.test(title))department='spring-wreath-garland';
 else if(/\b(?:tree|topiary)\b/i.test(title)&&!/\b(?:stem|spray|pick|branch)\b/i.test(title))department='spring-tree';
 else if(/\b(?:potted|in\s+(?:a\s+)?(?:\w+\s+){0,3}(?:pot|vase|planter|basket)|vase arrangement|pot arrangement|succulent|cactus|cacti|fern|hanging plant|trailing plant|bonsai)\b/i.test(title))department='spring-potted';
 else if(/\b(?:bouquet|pick|stem|spray|branch|bunch|bush)\b/i.test(title))department='spring-stems';
 else if(/potted-(?:herbs|flowers|ferns)/i.test(category))department='spring-potted';
 else if(/picks-stems|bouquets-and/i.test(category))department='spring-stems';
 return{disposition:department?'candidate':'review',department,reason:department?'offered-botanical-object-needs-photo':'object-needs-source-and-photo-review',evidence:title};
}
export function springImageDecision(p,visual){
 const source=springSourceDecision(p);if(source.disposition==='exclude')return source;
 if(!p.detailsReady||!visual?.imageHash)return{...source,disposition:'review',reason:'exact-SKU-description-or-photo-missing'};
 const scores=visual.season||{},bad=Math.max(scores.autumn||0,scores.christmas||0,scores.dried||0,scores.other||0),good=Math.max(scores.freshFlowers||0,scores.greenFoliage||0),top=visual.objects?.[0];
 if(bad>good&&bad>.33)return{...source,disposition:'exclude',reason:'source-photo-non-spring',visual};
 if(!source.department&&top?.id!=='other'&&top?.score>=.60&&/\b(?:artificial|faux|fake|floral|flowers?|foliage|plant|ferns?|orchid|succulent|tree|ivy|moss|leaves)\b/i.test((p.variantName||'')+' '+(p.sourceDescription||'')))source.department=top.id;
 if(!source.department||good<.30||bad>=good*.85||top?.id!==source.department&&top?.score>.60)return{...source,disposition:'review',reason:'source-photo-or-object-conflict',visual};
 return{...source,disposition:'include',reason:'exact-SKU-description-and-source-photo-agree',visual};
}
