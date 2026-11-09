// Classify the offered SKU, not motifs printed on it or objects in its roomset.
// This module has no network or model dependencies and is shared by monitoring
// and the public catalogue. Image scores are evidence, never fabricated facts.
export const TAXONOMY_VERSION='2026-11-04-object-season-v2';
export const isPublishedProduct=p=>!p.taxonomyAudit||p.taxonomyAudit.disposition==='include';
export function productDescription(p){return String(p.sourceDescription||p.appearanceSource?.descriptionText||p.productSummary||'');}
export function productBody(p){
 const parts=String(p.variantName||p.name||'').trim().split(/\s[-–]\s/);
 const option=/^(?:(?:(?:light|dark|warm|cool|bright|antique|natural|deep|dusky|royal|holographic)\s+)*(?:green|red|white|cream|ivory|black|grey|gray|pink|rose gold|gold|silver|blue|navy|purple|orange|yellow|brown|beige|teal|copper|bronze|clear|transparent|multicolou?r|multi|natural|frosted)(?:\b|[ /&,+])|(?:less than\s+)?\d+(?:\.\d+)?\s*(?:cm|mm|m|ft|in|feet)\b)/i;
 while(parts.length>1&&option.test(parts.at(-1)))parts.pop();return parts.join(' - ');
}
const hit=(id,reason,evidence,extra={})=>({id,method:'offered-SKU-object',reason,evidence,...extra});
function extent(p){const v=p.dimensions?.values||p.specifications||{};const ns=['Diameter','Width','Height','Length'].map(k=>parseFloat(v[k])).filter(Number.isFinite);return ns.length?Math.max(...ns):null;}
export function offeredObject(p,{visual=p.taxonomyVisual}={}){
 const title=String(p.variantName||p.name||''),body=productBody(p),nounBody=productBody(p).split(/\b(?:with|holding|carrying|wearing|featuring)\b/i)[0],description=productDescription(p),lead=description.slice(0,650),crumbs=(p.detailEvidence?.breadcrumbs||[]).join(' '),size=extent(p);
 const r=(id,reason,extra)=>hit(id,reason,body,extra);
 if(/\b(?:hanging ornament|tree decoration|tree ornament)\b/i.test(body)&&/\b(?:stocking|sack|bag|cushion|mug|bowl|plate)\b/i.test(body)&&size!==null&&size<=22)return r('tree-decorations','miniature-ornament-shaped-as-a-stocking-or-accessory');
 if(/\bstorage bags?\b/i.test(nounBody))return r('ornaments','actual-seasonal-storage-bag-not-its-contents',{subtype:'accessory'});
 if(/\b(?:snow spray|spray snow|tree stand)(?! cover)\b/i.test(nounBody))return r('ornaments','tree-accessory-not-a-whole-tree',{subtype:'accessory'});
 if(/\b(?:tree flowers?|poinsettia (?:flowers? )?ornaments?)\b/i.test(nounBody))return r('tree-decorations','floral-tree-ornaments-not-a-whole-tree');
 if(p.kind==='tree'&&/\btree(?:s)?\b/i.test(nounBody)&&!/\b(?:baubles? set|tree (?:topper|skirt|collar)|tree stand cover|tree shaped (?:bauble|ornament)|hanging tree|tree (?:hanging|pendant)|craft kit|diamond art|stocking|cushion)\b/i.test(nounBody))return r('tree','whole-tree-SKU-and-source-catalogue');
 if(/\btree (?:base )?(?:skirt|collar)\b|tree stand cover/i.test(body))return r('skirt','tree-base-cover');
 if(p.kind==='skirt'&&/\b(?:tree mat|tree base|floor protector)\b/i.test(body))return r('skirt','tree-base-and-floor-cover');

 // Containers, clothing, printed products, kits and supports are their own
 // objects even when 'wreath', 'Santa' or 'Christmas tree' describes a motif.
 if(/\b(?:shopper bags?|shopping bags?|tote bags?|drawstring (?:lined )?bags?|filled cushions?|cutlery holders?|bottle covers?|(?:Christmas )?eve (?:gift )?box(?:es)?|keepsake box(?:es)?|card holders?|pop[ -]?up cards?)\b/i.test(body)||/\b(?:plates?|bowls?|serving trays?|treat trays?)\b/i.test(nounBody)&&!/\b(?:candle|tea[ -]?light|votive)\b/i.test(nounBody))return r('ornaments','offered-homeware-container-or-card-not-its-printed-motif',{subtype:'homeware-or-accessory'});
 if(/\b(?:wreath|garland)\b/i.test(nounBody)&&/\b(?:hang(?:er|ers)|hooks?)\b/i.test(nounBody)||/\bdoor\s+(?:plate\s+)?hang(?:er|ers)\b/i.test(nounBody))return r('wall','actual-door-support-or-hanging-decoration-not-a-wreath',{subtype:'accessory'});
 if(/\b(?:wreath|garland)\s+(?:hang(?:er|ers)|hooks?|holders?|storage|bags?|boxes|stockings?|cushions?)\b|\b(?:hook|hanger|holder)\b.{0,20}\bwreath\b/i.test(body))return r(/\b(?:stocking|cushion|storage|bag|box)\b/i.test(body)?'ornaments':'wall','wreath-accessory-or-printed-object',{subtype:'accessory'});
 if(/\b(?:kit|kits)\b/i.test(nounBody)&&/\b(?:make your own|paint your own|diamond your own|crystal canvas|making kit|paperchains?|plywood lantern)\b/i.test(nounBody))return r('ornaments','offered-activity-kit-not-a-finished-model',{subtype:'craft-kit'});
 if(/\b(?:diamond (?:art|painting)|paint.by.numbers|cross.stitch|craft|embroidery)\b.{0,80}\b(?:kit|set)|\b(?:wreath|ornament)\s+(?:making|craft)\s+kit\b/i.test(body))return r('ornaments','craft-kit-not-the-depicted-wreath',{subtype:'craft-kit'});
 if(/\b(?:stockings?|sacks?|gift[ -]?bags?|gift[ -]?tags?|treat bags?|party bags?|wrapping paper|gift wrap|gift bows?|bedding|duvet|pillowcases?|cushions?(?: covers?)?|tablecloth|placemats?|napkins?|tea towels?|mugs?|tumblers?|pens?|pencils?|earrings?|pyjamas|socks|advent calendars?|ribbon rolls?)\b/i.test(nounBody)&&!/\b(?:cushion garland|pyjama standing)\b/i.test(body))return r('ornaments','actual-homeware-packaging-or-stockings',{subtype:'homeware-or-accessory'});
 if(/\bribbon\b/i.test(nounBody)&&/\bpick[ -]?up truck\b/i.test(nounBody))return r('ornaments','offered-ribbon-not-a-floral-pick');
 if(/\btree trim bows?\b/i.test(nounBody))return r('tree-decorations','explicit-tree-trimming-bows');
 if(/\bribbon\b/i.test(nounBody)&&!/\b(?:bows?|wreath|garland|swag|spray|pick|stem|candle|tealight|lantern|LED|lights?|lighting|figurine|inflatable|bauble|hanging|standing|door|wall|cone|tree\s+\d|pop[ -]?up tree)\b/i.test(nounBody))return r(/\btree\b/i.test(nounBody)?'tree-decorations':'ornaments','offered-ribbon-not-its-printed-object');
 if(/\b(?:birds?|peacocks?|robins?|butterflies|butterfly|flowers?|leaves|poinsettia)\b/i.test(body)&&/\b(?:with (?:a )?clip|clip[ -]?on|clips?)\b/i.test(body)&&!/\b(?:LED|lights?|lighting|fairy)\b/i.test(body))return r('tree-decorations','offered-clip-on-tree-ornament');
 if(/\btree (?:skirt|collar)\b|tree stand cover/i.test(body))return r('skirt','tree-base-cover');
 if(p.kind==='tree'&&!/\b(?:bauble|ornament|topper|skirt|collar|cover|tree decoration|cushion|pick|spray|clip|garland|wreath)\b/i.test(body))return r('tree','verified-tree-catalogue-and-offered-object');
 const hanging=/\b(?:hanging|hang|pendant|bauble|tree decoration|tree ornament)\b/i.test(body+' '+lead),small=size!==null&&size<=22;
 const freestanding=/\b(?:free[ -]?standing|stand[ -]?up)\b/i.test(body+' '+lead);
 if(/\bbirdhouse ornament\b/i.test(body)&&!hanging)return r('scenes','offered-miniature-birdhouse-scene-not-a-functional-garden-nest');
 if(/\binflatabl[ea]\b/i.test(body))return r('inflatable','inflatable-product');
 if(/\bcandle\s+(?:wreath|ring|lantern)|\bvotive|\bwreath\s+candle\s+holder/i.test(nounBody))return r('candle-holder','candle-decoration-ring-not-a-door-wreath');
 if(/\b(?:candle[ -]?(?:holder|stick|stand|bridge)s?|candelabra|tea[ -]?light[ -]?(?:holder|lantern)s?)\b/i.test(body))return r('candle-holder','candle-support-product');
 if(/\b(?:house|church|cottage|chalet|building|shop)\b/i.test(body)&&!hanging&&!/\b(?:house shaped|house)\b.{0,30}\b(?:light string|garland|wreath|cushion|canvas|sign|plaque)\b/i.test(body)&&!/\b(?:wreath|garland)\b.{0,12}\b(?:for|on)\b/i.test(body))return r('scenes','offered-house-or-building-not-its-wreath-motif');
 if(freestanding&&!/\b(?:bauble|tree topper|hanging|pendant)\b/i.test(body))return r('standing','explicit-free-standing-SKU-description');
 if(/\b(?:baubles?|tree (?:decorations?|ornaments?|toppers?|pendants?)|shatterproof|flower clips?|floral clips?|poinsettia clips?)\b/i.test(body)&&!/\b(?:bauble wreath|bauble garland|bauble swag|bauble pick|bauble spray|wreath with baubles)\b/i.test(body))return r('tree-decorations','offered-tree-ornament-or-clip');
 if(/\b(?:string (?:light|lighting)|fairy lights?|cluster lights?|icicle lights?|net lights?|curtain lights?|rope lights?|neon(?: flex| effect| lights?)?|light strings?|festoon lights?|tree lights?)\b/i.test(nounBody))return r('lights','offered-lighting-not-a-decorative-motif');
 if(/\bspheres?\b/i.test(nounBody)&&/\bLEDs?\b/i.test(body))return r('lights','offered-LED-sphere-not-the-branches-used-for-installation');
 if(/\b(?:potted|pop[ -]?up|slim|pencil|artificial|pre[ -]?lit|flocked|fibre optic)\b.{0,65}\b(?:christmas|xmas|pine|fir|spruce|tinsel)\s+tree\b/i.test(nounBody)&&!hanging&&!/\b(?:ornaments?|flowers?|craft|spray|topper|stand)\b/i.test(nounBody))return r('tree','offered-whole-christmas-tree');
 const beforeContext=body.split(/\b(?:with|holding|carrying|wearing|featuring|decorated with|in (?:a )?gift[ -]?box(?:es)?)\b/i)[0];
 if(/\b(?:gift box packaging|packaged in (?:a )?gift box|supplied in (?:a )?gift box)\b/i.test(lead)&&/\b(?:ornament|bauble|decoration)\b/i.test(body))return r('ornaments','gift-box-is-packaging-not-the-product');
 const present=/\b(?:presents?|parcels?|gift[ -]?box(?:es)?)\b/i.test(beforeContext),other=/\b(?:picks?|sprays?|stems?|wreaths?|garlands?|swags?|stockings?|nutcrackers?|snow[ -]?globes?|village|scene|calendar|tags?|bags?|mice|mouse|cats?|ducks?|list box|eve box|cookie jar|treat box)\b/i.test(beforeContext);
 if(present&&/\bsleigh\b/i.test(beforeContext))return r('standing','offered-sleigh-not-a-present-shaped-box');
 if(present&&!other||/\bemerging out of.{0,100}\b(?:present|gift) box\b/i.test(lead))return r('presents','actual-present-shaped-decoration');
 if(/\b(?:swags?|tear[ -]?drops?)\b/i.test(body)&&!/\b(?:bauble|glass|crystal|tree (?:ornament|decoration))\b/i.test(body))return r('swag','offered-foliage-swag-or-drop');
 // Garland precedes incidental 'wreath' in SEO-heavy garland titles. A genuine
 // wreath-and-garland set is the only reason to assign both foliage classes.
 const foliageBody=/\b(?:santa|snowman|elf|gnome|gonk|reindeer|bell|sphere|ball|figurine|figure)\b/i.test(nounBody)&&nounBody!==body?nounBody:body;
 if(/\bgarlands?\b|mantel[ -]?piece (?:foliage|decoration)/i.test(foliageBody)){
  if(/\b(?:set|bundle|pack)\b/i.test(body)&&/\bwreath\b/i.test(body))return r('wreath','explicit-wreath-and-garland-set',{additional:['garland']});
  return r('garland','offered-continuous-garland');
 }
 if(/\bwreaths?\b/i.test(foliageBody)){
  if(hanging&&small&&!/\b(?:door|front door|doorway|wall|full size)\b/i.test(body))return r('tree-decorations','miniature-wreath-shaped-tree-ornament');
  if(/\b(?:wreath house|wreath cottage)\b/i.test(body))return r('scenes','house-with-wreath-motif');
  return r('wreath','offered-full-wreath');
 }
 if(/\b(?:picks?|sprays?|stems?|branches|branch|bush(?:es)?|sprigs?|floral stems?)\b/i.test(foliageBody)&&!/\b(?:snow spray|spray paint|spray snow|bauble|candle|tinsel|ribbon)\b/i.test(foliageBody))return r('spray','offered-floral-stem-or-pick');
 if(/\b(?:nativity|village|scene|diorama|snow[ -]?globes?|water[ -]?spinner|model (?:train|house|church))\b/i.test(body))return r('scenes','offered-miniature-scene-or-globe');
 if(/\b(?:wall[ -]?(?:art|decor|decoration|hanging|sticker|mounted)|canvas|framed|window (?:sticker|cling|decal)|door (?:sign|plaque)|hanging (?:sign|plaque)|bunting|banner)\b/i.test(body))return r('wall','offered-wall-sign-art-or-bunting');
 if(/\b(?:ornament display stand|display easel)\b/i.test(body))return r('standing','display-stand');
 if(/\blanterns?\b/i.test(body))return r('lights','offered-lantern');
 if(freestanding||/\b(?:standing|stand[ -]?up)\b/i.test(body))return r('standing','explicit-free-standing-object');
 if(hanging){if(small||/tree decorations?/i.test(String(p.specifications?.['Decoration Type']||''))||/tree decorations?/i.test(crumbs))return r('tree-decorations','small-hanging-tree-ornament');if(size>22)return r('wall','larger-hanging-decoration');return r('ornaments','hanging-decoration-size-or-use-unspecified');}
 if(/\b(?:LEDs?|lights|lighting|lamps?|light up|light-up|infinity light|neon|light sign|night light|light decoration|Christmas light)\b/i.test(nounBody))return r('lights','offered-decorative-lighting-after-specific-object-checks');
 if(/tree decorations?/i.test(crumbs))return r('tree-decorations','official-ornament-category-after-physical-object-exclusions');
 if(/\b(?:nutcracker|gonks?|gnomes?|santa|snowman|penguin|reindeer|polar bear|figurine|figure|elf|elves|soldier)\b/i.test(body)&&!/\b(?:clip|hanging|pendant|bauble|sticker|ribbon|sign|paper|wrap)\b/i.test(body))return r('standing','decorative-figure-without-hanging-or-printed-support');
 return r('ornaments','other-offered-christmas-decoration');
}

export function christmasEligibility(p,object=offeredObject(p),visual=p.taxonomyVisual){
 const rawTitle=productBody(p),brand=String(p.brand||'').trim(),title=brand&&rawTitle.toLowerCase().startsWith(brand.toLowerCase()+' ')?rawTitle.slice(brand.length).trim():rawTitle,description=productDescription(p),lead=description.slice(0,1000),specs=p.specifications||{},occasion=String(specs.Occasion||specs.Season||'');
 const titleSeason=/\b(?:halloween|easter|thanksgiving|valentine|cupids? arrow|spring|summer|harvest|autumn(?:al)?|eid|ramadan|diwali|hanukkah|birthday|wedding|baby shower|graduation)\b/i.exec(title),occasionSeason=/\b(?:halloween|easter|thanksgiving|valentine|spring|summer|harvest|autumn(?:al)?|eid|ramadan|diwali|hanukkah|birthday|wedding|baby shower|graduation)\b/i.exec(occasion),positiveTitle=/\b(?:christmas|xmas|santa|noel|gingerbread|nutcracker|candy cane|jingle bell)\b/i.test(title),explicit=titleSeason||(!positiveTitle?occasionSeason:null);
 // Autumn can name a Christmas bauble's colour/finish. Its object and actual
 // Christmas usage must agree; autumn wreaths/garlands never get this exception.
 const christmasOrnamentFinish=explicit&&/\b(?:bauble|tree ornament|christmas tree decoration|scentsicles|scentfetti)\b/i.test(title)&&/\b(?:christmas|xmas|festive tree)\b/i.test(title+' '+lead),dualChristmasUse=positiveTitle&&/^(?:wedding|birthday|graduation)$/i.test(explicit?.[0]||'');
 if(explicit&&!christmasOrnamentFinish&&!dualChristmasUse)return {disposition:'exclude',reason:'other-season-or-holiday',evidence:explicit[0]};
 const describedHoliday=/\b(?:halloween|easter|thanksgiving|valentines?|eid|ramadan|diwali|hanukkah|baby shower|gender reveal)\b/i.exec(lead);
 if(!positiveTitle&&describedHoliday&&!/\b(?:christmas|xmas|santa|noel|nativity|advent)\b/i.test(lead))return {disposition:'exclude',reason:'SKU-description-identifies-another-holiday',evidence:describedHoliday[0]};
 // A Christmas-biased image score cannot establish Christmas use for a
 // distinctive Easter, autumn or spring floral object. Exact-image reviews
 // may exclude it; otherwise require product-specific Christmas evidence.
 const otherSeasonBody=/\b(?:rabbit[ -]shaped|(?:wool )?pumpkin)\b.*\b(?:wreath|garland)\b|\btwig flower.*butterfly.*wreath\b/i.test(title);
 if(otherSeasonBody&&!positiveTitle&&!(p.detailEvidence?.verifiedProductSection&&/\b(?:christmas|xmas|santa|noel|nativity|advent)\b/i.test(lead)))return {disposition:'review',reason:'distinct-other-season-object-needs-specific-Christmas-use-evidence',evidence:title};
 if(/\b(?:removable micro hooks?|hanger hooks?)\b/i.test(title)&&!/\b(?:christmas|xmas|wreath|bauble|tree decoration)\b/i.test(title)&&/\b(?:wardrobe|clothes|self[ -]adhesive|removable wall hooks?)\b/i.test(lead))return {disposition:'exclude',reason:'general-household-hook-not-a-Christmas-product',evidence:title};
 if(/\b(?:hardy|live plant|photinia|live succulent|9cm plant)\b/i.test(title)&&!/\b(?:plant pot|pot cover|ornament|silhouette|artificial)\b/i.test(title)&&!/\b(?:artificial|faux|christmas|xmas)\b/i.test(title))return {disposition:'exclude',reason:'non-christmas-live-plant',evidence:title};
 if(/\b(?:batteries?|alkaline|agfa photo|extension (?:cable|lead)|battery box|light connector|timer plug)\b/i.test(title)&&!/\b(?:christmas|xmas|festive|decorat|wreath|garland|santa|snowman|battery (?:powered|operated)|(?:icicle|fairy|string|net|curtain|cluster) lights?)\b/i.test(title))return {disposition:'exclude',reason:'general-electrical-accessory-not-a-christmas-product',evidence:title};
 const noun=title.split(/\b(?:with|holding|carrying|wearing|featuring)\b/i)[0];
 if(/\bbirdhouse ornament\b/i.test(noun)&&/\bchristmas\b/i.test(occasion)&&p.detailEvidence?.verifiedProductSection)return {disposition:'include',reason:'verified-Christmas-miniature-birdhouse-ornament-not-a-garden-nest',evidence:occasion};
 if(/\b(?:speakers?|wall anchors?|veneer pins?|dowsing|healing crystals?|pendulums?|plant support|bonsai|monstera|eucalyptus tree|garden seeds?|lettuce seeds?|interlocking garden|hedge screen|tool (?:hooks?|hanger)|picture (?:hooks?|hanging|pins?)|frame fixings|moulding hooks?|glass plates|d rings|calendar hooks|metal wall hook rail|PSU|mains socket|outdoor lead|spell tube|incense|cauldron|witchy|bubble (?:effect|fog) machine|mirror ball.{0,40}rotating|bird (?:feeder|bath)|garden stake|birdhouse|nest box|wisteria|palm tree|flower arrangement|peony|hydrangea|dahlia|cornflower|carnation|globe thistle|orchid|faux ficus)\b/i.test(noun)&&!/\b(?:christmas|xmas|santa|snowman|gingerbread|candy cane|snowflake|poinsettia|holly|mistletoe)\b/i.test(noun))return {disposition:'exclude',reason:'non-christmas-product-body-not-a-seasonal-decoration',evidence:noun};
 if(object.id==='tree'&&/\b(?:pine|fir|spruce|tinsel|pencilimo|pop[ -]?up|fibre optic|snowy|flocked|birch|twig|paper|glitter|cone)\b/i.test(title))return {disposition:'include',reason:'Christmas-tree-form-description-and-source-image',evidence:title};
 if((p.themeIds||[]).some(id=>id.startsWith('theme-')))return {disposition:'include',reason:'verified-official-Christmas-theme-membership-and-product',evidence:p.themeIds.join(',')};
 if(object.id==='tree'&&p.kind==='tree')return {disposition:'include',reason:'verified-whole-tree-object-and-Christmas-tree-source',evidence:title};
 if(object.id==='spray'&&/\b(?:glitter|flocked|frosted|snow|pinecones?|pine|fir|spruce|holly|mistletoe|poinsettia)\b/i.test(title))return {disposition:'include',reason:'Christmas-floristry-finish-or-foliage-and-image',evidence:title};
 if(object.id==='lights'&&(p.lightingDepartmentIds||[]).includes('lights')&&!/\b(?:football|gaming|game on|disco motor|bubble machine)\b/i.test(title))return {disposition:'include',reason:'verified-official-Christmas-lighting-object',evidence:title};
 if(/\b(?:teddy bear|bunny rabbit teddy|football kit|personalised gift|fortune tree|tree of life|birthday gift|3D LED (?:letter|number)|LED (?:letter|number))\b/i.test(title)&&!/\b(?:christmas|xmas|santa|gingerbread|snowman|reindeer|elf)\b/i.test(title+' '+occasion))return {disposition:'exclude',reason:'non-christmas-gift-or-personalised-product-body',evidence:title};
 if(object.subtype==='accessory'&&/\btree stand\b/i.test(title)&&(/\bchristmas\b/i.test(rawTitle)||p.brand==='Christmas Tree World'))return {disposition:'include',reason:'verified-Christmas-tree-support-accessory',evidence:rawTitle};
 const festive=/\b(?:christmas|chrismas|xmas|santa|santa claus|no[eë]l|nativity|advent|gingerbread|candy cane|nutcracker|festive|yuletide|yuletide|snowman|jingle bell|poinsettia|holly|mistletoe|snowballs?|snowflakes?|sleigh|reindeer|elf)\b/i;
 if(festive.test(title)||festive.test(occasion)||festive.test(lead))return {disposition:'include',reason:'SKU-christmas-description-or-object',evidence:(title+' '+occasion+' '+lead).match(festive)?.[0]};
 if(christmasOrnamentFinish)return {disposition:'include',reason:'Christmas-tree-bauble-finish-not-a-seasonal-wreath',evidence:title};
 if(object.id==='skirt')return {disposition:'include',reason:'offered-Christmas-tree-base-cover',evidence:title};
 const seasons=visual?.seasons||[],top=seasons[0];
 if(object.id==='lights'&&/\b(?:string lights?|fairy lights?|icicle lights?|net lights?|cluster lights?|curtain lights?|rope lights?|tree lights?)\b/i.test(title))return {disposition:'include',reason:'Christmas-lighting-assortment-actual-light-set',evidence:title};
 if(top&&['halloween','spring','autumn','easter'].includes(top.id)&&/\b(?:pumpkin|ghost|spider|bat|skull|maple|sunflower|wheat|flower|floral|daisy|blossom|butterfly|egg|rabbit|lily|lilies|peony|rose|foliage|berry|berries)\b/i.test(title)&&top.score>=.52&&top.score>=2*(seasons.find(x=>x.id==='christmas')?.score||0))return {disposition:'exclude',reason:'non-christmas-image-and-no-SKU-christmas-evidence',evidence:top.id};
 if(/\b(?:bauble|tinsel|tree topper|tree ornament|tree decoration|reindeer|gonk|gnome|snow globe|snowflake|angel|penguin|polar bear|robin)\b/i.test(title))return {disposition:'include',reason:'Christmas-assortment-object-and-image',evidence:title};
 if(top?.id==='christmas'&&top.score>=.3)return {disposition:'include',reason:'Christmas-image-and-official-Christmas-assortment',evidence:'image-score:'+top.score};
 const crumbs=(p.detailEvidence?.breadcrumbs||[]).join(' > ');
 if(/\bchristmas\b/i.test(crumbs)&&!/\b(?:willow (?:round|heart) wreath|whitewashed root branch wreath|moss wreath ring|wire wreath base|foam ring|display plinth)\b/i.test(title))return {disposition:'include',reason:'exact-SKU-official-Christmas-category-and-object-image-review',evidence:crumbs};
 if(crumbs&&!/\bchristmas\b/i.test(crumbs))return {disposition:'exclude',reason:'non-christmas-SKU-category-body-and-image',evidence:crumbs};
 if(['wreath','garland','spray','swag','candle-holder'].includes(object.id)&&!/\b(?:pine|pinecones?|fir|spruce|holly|mistletoe|poinsettia|frosted|snowy|snow flocked|berry|berries)\b/i.test(title+' '+lead)&&(!top||top.id!=='christmas'||top.score<.3))return {disposition:'review',reason:'generic-floral-or-craft-product-without-christmas-evidence',evidence:title};
 // An official Christmas source supports ambiguous neutrals, but does not
 // override a product description explicitly identifying another season.
 return {disposition:'review',reason:'no-product-specific-Christmas-evidence',evidence:title};
}

export function objectMemberships(p,object){
 const ids=[object.id,...object.additional||[]],s=p.specifications||{},title=productBody(p),description=productDescription(p);
 if(/\b(?:outdoor|garden|lawn|pathway|weather[ -]?proof)\b/i.test(title)||/\boutdoor\b/i.test(String(s['Indoor/Outdoor']||s['Suitable For']||''))||/\b(?:suitable|designed|ideal) for (?:both indoor and )?outdoor\b/i.test(description))ids.push('outdoor');
 // Official lighting/theme membership is an additional view, not evidence that
 // a bell, stocking or house is a full wreath.
 const light=(p.lightingDepartmentIds||[]).filter(id=>['lights','string-lights','indoor-lights','outdoor-lights','christmas-lanterns','acrylic-lights','christmas-tree-lights'].includes(id));
 if(object.id==='lights'||light.length){ids.push('lights',...light);if(!light.length){if(/\blantern/i.test(title))ids.push('christmas-lanterns');else if(/\b(?:string|fairy|cluster|icicle|net|curtain|rope)\b/i.test(title))ids.push('string-lights');if(ids.includes('outdoor'))ids.push('outdoor-lights');else ids.push('indoor-lights');if(/\btree lights?|lights? for (?:a |the )?christmas tree\b/i.test(title))ids.push('christmas-tree-lights');}}
 ids.push(...(p.themeIds||[]).filter(id=>id==='themes'||id.startsWith('theme-')));
 return [...new Set(ids)];
}
