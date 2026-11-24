import{springSourceText}from'./spring-source-facts.mjs';
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
const seasonWords=/\b(?:autumn(?:al)?|fall[ -](?:colou?r|foliage|wreath|garland)|halloween|harvest|thanksgiving|pumpkins?|christmas|xmas|festive|poinsettia|winter|snowy|frosted|snow[ -]?(?:covered|flocked)|holly|mistletoe)\b/i;
const dried=/\b(?:dried|dried[ -]look|pampas|burnt orange|rust[ -]colou?red|copper[ -]foliage)\b/i;
// A botanical subject sold already arranged in a vase is included. An empty
// vase, planter, flower rack, live plant or craft component is not the object.
export function springSourceDecision(p){
 const title=String(p.variantName||p.name||''),description=springSourceText(p),category=String(p.breadcrumb||p.productPath||p.variantPath||p.sourceUrl||''),text=title+' '+description;
 // Sea holly is Eryngium, a flowering botanical species, not Christmas holly.
 // Keep explicit occasion/season fields intact when removing that title alias.
 const seasonalIdentity=title.replace(/\bsea[ -]holly\b/gi,'Eryngium')+' '+String(p.specifications?.Season||p.specifications?.Occasion||'');if(seasonWords.test(seasonalIdentity))return{disposition:'exclude',reason:'explicit-non-spring-season',evidence:seasonalIdentity.match(seasonWords)[0]};
 const context=description.match(/\b(?:autumn(?:al)?|halloween|harvest|christmas)\s+(?:colou?rs?|foliage|leaves|wreath|garland|arrangement|bouquet|decoration)|\b(?:rust|burnt orange)\s+(?:leaves|foliage)\b/i),usageOnly=context&&/\b(?:ideal|perfect|suitable|great|use|used)\s+(?:for|in|as)\s*$/i.test(description.slice(Math.max(0,context.index-45),context.index));if(context&&!usageOnly)return{disposition:'exclude',reason:'description-identifies-non-spring-product',evidence:context[0]};
 // Black olive names a green-leaved tree; it is not a black foliage colour.
 const paletteTitle=title.replace(/\bblack[ -]olive\b/gi,'olive');
 if(/\bblack\b.{0,35}\b(?:chrysanthemum|rose|dahlia|flower|foliage|leaf|leaves)\b/i.test(paletteTitle)&&!/\b(?:pot|planter|vase)\b/i.test(title))return{disposition:'exclude',reason:'explicit-dark-non-spring-floral-palette',evidence:title};
 if(dried.test(title))return{disposition:'exclude',reason:'dried-or-autumn-palette',evidence:title.match(dried)[0]};
 const outside=/\b(?:living\s+wall|vertical\s+garden|(?:wall|foliage|grass|hedge|fence)\s+(?:panels?|tiles?)|(?:plant|boxwood)\s+wall|hedg(?:e|ing)\s+(?:screen|fence|panel)|(?:conifer|privacy)(?:\s+leaf)?\s+screening|privacy\s+(?:screen|fence)|artificial\s+(?:hedging|turf))\b/i,featureHead=description.split(/\n/).filter(l=>/^\s*[-*]\s+/.test(l)).slice(0,3).join(' ');
 if((outside.test(title)||outside.test(featureHead)||/\b(?:interlocking|modular)\b.{0,80}\bpanels?\b/i.test(featureHead))&&!/\b(?:garlands?|wreaths?|stems?|sprays?|trees?|potted)\b/i.test(title))return{disposition:'exclude',reason:'botanical-panel-or-support-outside-four-forms',evidence:title+' '+featureHead};
 if(/\b(?:3d\s*printer|printer\s*filament|plant\s*stand|plantstand|plant\s*trellis|garden\s*trellis|raised\s*garden\s*bed|doorstop|bow\s*cushion\s*garland)\b/i.test(title))return{disposition:'exclude',reason:'unrelated-product-or-empty-garden-support',evidence:title};
 // "Leaf" is also a supplier name. A Leaf stand with an empty planter
 // does not include the plant used to style the source photograph.
 if(/\bstand\s+(?:with|and|&)\b.{0,80}\b(?:planter|pot)\b/i.test(title)&&!/\b(?:artificial|faux|fake|potted|tree|fern|foliage|flowers?|succulent)\b/i.test(title.replace(/^Leaf\s+/i,'')))return{disposition:'exclude',reason:'offered-stand-and-empty-planter',evidence:title};
 if(/\b(?:flower\s+petals?|flower\s+crowns?)\b/i.test(title))return{disposition:'exclude',reason:'detached-petals-or-wearable-accessory-outside-four-forms',evidence:title};
 // A suspended or bare ball is not a tree. A real topiary tree can have a
 // ball-shaped crown; retain those when a trunk/tree or supplied pot is clear.
 if(/\b(?:topiary|hanging|flower)\b.{0,65}\bballs?\b/i.test(title)&&!/\b(?:trunk|potted|window\s+box|planters?|pots?)\b/i.test(title)&&(!/\btrees?\b/i.test(title)||/\bhanging\b/i.test(title)))return{disposition:'exclude',reason:'suspended-or-bare-botanical-ball-outside-four-forms',evidence:title};
 if(/\b(?:live|living|real)\s+(?:plants?|trees?|flowers?)|\b(?:seeds?|bulbs?)\s+(?:for|to)\s+(?:plant|grow)|\b(?:flower heads?|petal confetti|plant stands?|plant racks?|vase fillers?|wall art|wall panels?|memorial vases?|flower pots? holders?)\b/i.test(title))return{disposition:'exclude',reason:'non-artificial-botanical-product',evidence:title};
 if(/\b(?:print|printed|pattern|embossed)\b/i.test(title)&&/\b(?:pots?|vases?|jugs?|planters?)\b/i.test(title)&&!/\b(?:artificial|faux|potted|arrangement)\b/i.test(title))return{disposition:'exclude',reason:'printed-empty-container',evidence:title};
 const firstFeature=description.split(/\n/).find(l=>/^\s*[-*]\s+/.test(l))||'';
 if(/(?:^|\/)vases(?:\/|$)/i.test(category)&&/\bvases?\b/i.test(firstFeature)&&!/\b(?:artificial|faux|potted|arrangement|includes?|included)\b/i.test(firstFeature))return{disposition:'exclude',reason:'official-vase-category-and-offered-container-description',evidence:firstFeature};
 const foliage=/\b(?:artificial|faux|fake|silk|flower|floral|foliage|leaf|leaves|garland|wreath|stem|spray|bouquet|pick|tree|potted|plant|fern|orchid|rose|hydrangea|eucalyptus|tulip|daisy|peony|gypsophila|lavender|blossom)\b/i;
 const namedPlantVessel=/(?:^|\/)artificial-(?:plants|flowers)(?:\/|$)/i.test(category)&&/\b(?:lily|lilies|eucalyptus|hydrangea|peony|tulip|rose|daisy|lavender)\b/i.test(title);
 if(/\b(?:vases?|planters?|pots?|baskets?|urns?|stands?|frames?|holders?|jugs?|bottles?|mugs?|watering cans?)\b/i.test(title)&&!namedPlantVessel&&!(/\b(?:in|with)\b[\s\S]*\b(?:pots?|vases?|planters?|baskets?|jugs?)\b|\b(?:arrangement|potted|artificial|faux|fake|tree|fern|succulent|orchid|flowering)\b/i.test(title)))return{disposition:'exclude',reason:'empty-container-or-accessory',evidence:title};
 if(!foliage.test(title+' '+category))return{disposition:'review',reason:'botanical-object-unconfirmed',evidence:title};
 const opening=(description.split(/## Information\s*/i)[1]||'').split(/(?<=[.!?])\s+/)[0]||'',offered=featureHead+' '+opening;
 const exactText=description;
 const bare=/\b(?:bare[ -]stem(?:med)?|unpotted|with\s+no\s+pots?|no\s+(?:pot|planter)(?:\s+or\s+(?:pot|planter))?\s+(?:is\s+)?included|(?:supplied|provided)\s+without\s+(?:a\s+)?(?:pot|planter))\b/i.test(title+' '+exactText);
 const titledPot=/\bpotted\b|\b(?:in|with)\s+(?:(?!no\b|not\b)\w+\s+){0,5}(?:pot|planter|vase|basket)\b/i.test(title);
 if(bare&&titledPot)return{disposition:'review',reason:'offered-pot-contents-conflict',evidence:title+' '+offered};
 // Some exact retailer titles append "Artificial Flower Stem" even to a
 // complete 150–240cm olive tree. Ignore that generic suffix for the tree
 // candidate only; genuine branches/stems earlier in the offer still win.
 const treeFormTitle=title.replace(/\bArtificial Flower Stem\b(?=\s*(?:-|$))/i,'');
 let department;
 if(/\b(?:garlands?|wreaths?|swags?)\b/i.test(title))department='spring-wreath-garland';
 else if((/\btrees?\b/i.test(treeFormTitle)||!bare&&/\b(?:artificial\s+(?:bay\s+)?tree|natural\s+(?:wood\s+)?trunk|authentic\s+trunk)\b/i.test(String(p.specifications?.Type||'')+' '+exactText)||/\btopiar(?:y|ies)\b/i.test(title)&&/\b(?:trees?|trunk)\b/i.test(featureHead))&&!/\b(?:stems?|sprays?|picks?|branches|branch)\b/i.test(treeFormTitle))department='spring-tree';
 else if(bare)department='spring-stems';
 else if(/\b(?:potted|hanging\s+(?:flower\s+)?baskets?|window\s+box|(?:in|with)\s+(?:(?!not\b|no\b)\w+\s+){0,5}(?:pots?|vases?|planters?|baskets?|jugs?)|vase arrangement|pot arrangement)\b/i.test(title))department='spring-potted';
 else if(/\b(?:bouquets?|picks?|stems?|sprays?|branches|branch|bunches|bunch|bushes|bush|bundle)\b/i.test(title))department='spring-stems';
 else if(/\b(?:succulent|cactus|cacti|fern|bonsai)\b/i.test(title))department='spring-potted';
 else if(/potted-(?:herbs|flowers|ferns)/i.test(category))department='spring-potted';
 else if(/picks-stems|bouquets-and/i.test(category))department='spring-stems';
 // Read offered contents rather than copying an end-use list such as
 // "make bouquets, wreaths and garlands" into the product's physical form.
 if(!department&&/\b(?:bouquet only|flower stem only|(?:supplied|pack|set)\b.{0,45}\bstems?\b|single stem|leaf stem|leaf spray|foliage spray)\b/i.test(offered))department='spring-stems';
 if(!department&&/\b(?:supplied\b.{0,50}\b(?:hanging basket|weighted pot|planter)|fully assembled\b.{0,35}\bhanging basket|flowers? in (?:a )?(?:basket|pot|vase))\b/i.test(offered))department='spring-potted';
 if(department==='spring-stems'&&!bare&&!/\b(?:bouquets?|picks?|stems?|sprays?|branches|branch|bunches|bunch|bundle)\b/i.test(title)&&/\b(?:arrives? potted|potted in|comes? in|supplied in|delivered in)\b.{0,55}\bpot\b/i.test(exactText))department='spring-potted';
 return{disposition:department?'candidate':'review',department,reason:department?'offered-botanical-object-needs-photo':'object-needs-source-and-photo-review',evidence:title,...(usageOnly?{seasonalUsageEvidence:{text:context[0],method:'retailer-end-use-suggestion-requires-native-review'}}:{})};
}
export function springImageDecision(p,visual){
 const source=springSourceDecision(p);if(source.disposition==='exclude')return source;
 if(!p.detailsReady||!visual?.imageHash||p.springNativePhotoVerified!==true)return{...source,disposition:'review',reason:'exact-SKU-description-or-photo-missing'};
 if(source.seasonalUsageEvidence)return{...source,disposition:'review',reason:'seasonal-end-use-text-requires-exact-source-and-native-photo-review',visual};
 const scores=visual.season||{},bad=Math.max(scores.autumn||0,scores.christmas||0,scores.dried||0,scores.other||0),good=Math.max(scores.freshFlowers||0,scores.greenFoliage||0),top=visual.objects?.[0];
 if((scores.other||0)>good&&(scores.other||0)>.33){const complete=['kept','selected'].includes(p.previewAudit?.status)&&!(p.previewAudit.issues||[]).some(i=>['logo','diagram','detail','cropped'].includes(i)),other=top?.id==='other'&&top.score>=.65&&/\b(?:vases?|planters?|bottles?|mugs?|jugs?|ceramic|pottery|ornament|holders?|watering cans?)\b/i.test((p.variantName||'')+' '+(p.sourceDescription||''));return{...source,disposition:complete&&other?'exclude':'review',reason:complete&&other?'whole-source-photo-and-description-confirm-non-botanical-object':'non-product-photo-needs-replacement',visual};}
 if(bad>good&&bad>.33)return{...source,disposition:'review',reason:'source-photo-non-spring-or-source-conflict',visual};
 // A circular arrangement of loose stems, a basket or a logo can all look
 // like a wreath to a similarity model. The offered form must come from
 // product facts or an exact source-and-photo human review, never shape alone.
 const objectScore=visual.objects?.find(o=>o.id===source.department)?.score||0;
 if(!source.department||good<.30||bad>=good*.85||objectScore<.25||top?.id!==source.department&&objectScore<top.score-.12)return{...source,disposition:'review',reason:'source-photo-or-object-conflict',visual};
 return{...source,disposition:'include',reason:'exact-SKU-description-and-source-photo-agree',visual};
}
