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
 if(/\bblack\b.{0,35}\b(?:chrysanthemum|rose|dahlia|flower|foliage|leaf|leaves)\b/i.test(title)&&!/\b(?:pot|planter|vase)\b/i.test(title))return{disposition:'exclude',reason:'explicit-dark-non-spring-floral-palette',evidence:title};
 if(dried.test(title))return{disposition:'exclude',reason:'dried-or-autumn-palette',evidence:title.match(dried)[0]};
 if(/\b(?:3d\s*printer|printer\s*filament|plant\s*stand|plantstand|plant\s*trellis|garden\s*trellis|raised\s*garden\s*bed|doorstop|bow\s*cushion\s*garland)\b/i.test(title))return{disposition:'exclude',reason:'unrelated-product-or-empty-garden-support',evidence:title};
 if(/\b(?:live|living|real)\s+(?:plants?|trees?|flowers?)|\b(?:seeds?|bulbs?)\s+(?:for|to)\s+(?:plant|grow)|\b(?:flower heads?|petal confetti|plant stands?|plant racks?|vase fillers?|wall art|wall panels?|memorial vases?|flower pots? holders?)\b/i.test(title))return{disposition:'exclude',reason:'non-artificial-botanical-product',evidence:title};
 if(/\b(?:print|printed|pattern|embossed)\b/i.test(title)&&/\b(?:pots?|vases?|jugs?|planters?)\b/i.test(title)&&!/\b(?:artificial|faux|potted|arrangement)\b/i.test(title))return{disposition:'exclude',reason:'printed-empty-container',evidence:title};
 const foliage=/\b(?:artificial|faux|fake|silk|flower|floral|foliage|garland|wreath|stem|spray|bouquet|pick|tree|potted|plant|fern|orchid|rose|hydrangea|eucalyptus|tulip|daisy|peony|gypsophila|lavender|blossom)\b/i;
 if(/\b(?:vases?|planters?|pots?|baskets?|urns?|stands?|frames?|holders?|jugs?|bottles?|mugs?|watering cans?)\b/i.test(title)&&!(/\b(?:in|with)\b[\s\S]*\b(?:pots?|vases?|planters?|baskets?|jugs?)\b|\b(?:arrangement|potted|artificial|faux|fake|tree|fern|succulent|orchid|flowering)\b/i.test(title)))return{disposition:'exclude',reason:'empty-container-or-accessory',evidence:title};
 if(!foliage.test(title+' '+category))return{disposition:'review',reason:'botanical-object-unconfirmed',evidence:title};
 let department;
 if(/\b(?:garlands?|wreaths?|swags?)\b/i.test(title))department='spring-wreath-garland';
 else if(/\b(?:trees?|topiar(?:y|ies))\b/i.test(title)&&!/\b(?:stems?|sprays?|picks?|branches|branch)\b/i.test(title))department='spring-tree';
 else if(/\b(?:potted|in\s+(?:a\s+)?(?:\w+\s+){0,3}(?:pots?|vases?|planters?|baskets?|jugs?)|vase arrangement|pot arrangement|succulent|cactus|cacti|fern|hanging plant|trailing plant|bonsai)\b/i.test(title))department='spring-potted';
 else if(/\b(?:bouquets?|picks?|stems?|sprays?|branches|branch|bunches|bunch|bushes|bush)\b/i.test(title))department='spring-stems';
 else if(/potted-(?:herbs|flowers|ferns)/i.test(category))department='spring-potted';
 else if(/picks-stems|bouquets-and/i.test(category))department='spring-stems';
 return{disposition:department?'candidate':'review',department,reason:department?'offered-botanical-object-needs-photo':'object-needs-source-and-photo-review',evidence:title};
}
export function springImageDecision(p,visual){
 const source=springSourceDecision(p);if(source.disposition==='exclude')return source;
 if(!p.detailsReady||!visual?.imageHash||p.springNativePhotoVerified!==true)return{...source,disposition:'review',reason:'exact-SKU-description-or-photo-missing'};
 const scores=visual.season||{},bad=Math.max(scores.autumn||0,scores.christmas||0,scores.dried||0,scores.other||0),good=Math.max(scores.freshFlowers||0,scores.greenFoliage||0),top=visual.objects?.[0];
 if((scores.other||0)>good&&(scores.other||0)>.33){const complete=['kept','selected'].includes(p.previewAudit?.status)&&!(p.previewAudit.issues||[]).some(i=>['logo','diagram','detail','cropped'].includes(i)),other=top?.id==='other'&&top.score>=.65&&/\b(?:vases?|planters?|bottles?|mugs?|jugs?|ceramic|pottery|ornament|holders?|watering cans?)\b/i.test((p.variantName||'')+' '+(p.sourceDescription||''));return{...source,disposition:complete&&other?'exclude':'review',reason:complete&&other?'whole-source-photo-and-description-confirm-non-botanical-object':'non-product-photo-needs-replacement',visual};}
 if(bad>good&&bad>.33)return{...source,disposition:/\b(?:spring|fresh|pink|white|green|yellow|blue|purple)\b/i.test(p.variantName||'')?'review':'exclude',reason:'source-photo-non-spring-or-source-conflict',visual};
 if(!source.department&&top?.id!=='other'&&top?.score>=.60&&/\b(?:artificial|faux|fake|floral|flowers?|foliage|plant|ferns?|orchid|succulent|tree|ivy|moss|leaves)\b/i.test((p.variantName||'')+' '+(p.sourceDescription||'')))source.department=top.id;
 const objectScore=visual.objects?.find(o=>o.id===source.department)?.score||0;
 if(!source.department||good<.30||bad>=good*.85||objectScore<.25||top?.id!==source.department&&objectScore<top.score-.12)return{...source,disposition:'review',reason:'source-photo-or-object-conflict',visual};
 return{...source,disposition:'include',reason:'exact-SKU-description-and-source-photo-agree',visual};
}
