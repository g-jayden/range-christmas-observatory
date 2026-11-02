import {createHash} from 'node:crypto';
export const APPEARANCE_VERSION='body-palette-seven-shapes-v1';
export const TREE_STYLES=['圣诞树盆栽','折叠式圣诞树','纤细圣诞树','雪景款','预亮灯款','标准款','其它树形类别'];
const colours=[['透明色',/\b(?:clear|transparent)\b/i],['古铜色',/\bbronze\b/i],['铜色',/\bcopper\b/i],['深空灰色',/\b(?:space gr[ae]y|dark gr[ae]y|charcoal|anthracite)\b/i],['绿色',/\b(?:green|sage|olive|emerald)\b/i],['白色',/\b(?:white|ivory|cream|off.white)\b/i],['黑色',/\bblack\b/i],['灰色',/\bgr[ae]y\b/i],['粉色',/\b(?:pink|rose|fuchsia|magenta)\b/i],['红色',/\b(?:red|burgundy|maroon|crimson|wine)\b/i],['褐色',/\b(?:brown|beige|tan|natural|hessian|burlap)\b/i],['金色',/\b(?:gold|golden|champagne)\b/i],['银色',/\bsilver\b/i],['蓝色',/\b(?:blue|navy)\b/i],['青色',/\b(?:teal|turquoise|cyan)\b/i],['紫色',/\b(?:purple|violet|lavender|lilac)\b/i],['橙色',/\borange\b/i],['黄色',/\byellow\b/i]];
export const PALETTE_ORDER=colours.map(x=>x[0]);
export function normaliseColors(value){const t=String(value||'').trim().replace(/natural\s+(?=green\b)/ig,'');if(!t)return [];const out=[];for(const [zh,re]of colours)if(t.includes(zh)||re.test(t))out.push(zh);return [...new Set(out)].filter(x=>!(x==='灰色'&&out.includes('深空灰色')));}
const materialTerms=[
 ['Mango Wood','芒果木',/\bmango(?: wood)?\b/i],['Bristle','毛刷纤维（成分未注明）',/\bbristles?\b/i],['Card','卡纸',/\bcard\b/i],['Foil','箔片（基材未注明）',/\bfoil\b/i],['Tinsel','亮片装饰条（基材未注明）',/\btinsel\b/i],['Plywood','胶合板',/\bplywood\b/i],['Slate','板岩',/\bslate\b/i],['Wire','金属线（金属未注明）',/\bwire\b/i],['Glitter','亮粉（基材未注明）',/\bglitter\b/i],['Fibre','纤维（成分未注明）',/\bfib(?:re|er)\b/i],['Palm Leaf','棕榈叶',/\bpalm lea(?:f|ves)\b/i],['Clay','黏土',/\bclay\b/i],['Satin','缎面（纤维未注明）',/\bsatin\b/i],['Bone China','骨瓷',/\bbone china\b/i],['Faux Leather','人造皮革',/\bfaux leather\b/i],['Leather','皮革',/\bleather\b/i],['Faux Silk','仿丝',/\bfaux silk\b/i],['Silk','丝绸',/\bsilk\b/i],['Eucalyptus','尤加利叶材',/\beucalyptus\b/i],['Ribbon','缎带（纤维未注明）',/\bribbon\b/i],['Crystal','水晶（原站标注）',/\bcrystal\b/i],['Stoneware','炻器',/\bstoneware\b/i],['Cane','藤茎材',/\bcane\b/i],['Cloth','织物（纤维未注明）',/\bcloth\b/i],['Mesh','网状材质（成分未注明）',/\bmesh\b/i],['String','线绳（纤维未注明）',/\bstring\b(?![ -]lights?)/i],['Paraffin','石蜡',/\bparaffin\b/i],['Polymer','聚合物（成分未注明）',/\bpolymer\b/i],['Polyurethane','聚氨酯',/\bpolyurethane\b/i],['Lurex','金银丝织物',/\blurex\b/i],['Cellophane','玻璃纸',/\bcellophane\b/i],['Canvas','帆布',/\bcanvas\b/i],['Cork','软木',/\bcork\b/i],['Straw','稻草',/\bstraw\b/i],['Twig','枝条（树种未注明）',/\btwig\b/i],['Fibrewood','木纤维板',/\bfibrewood\b/i],['Vinyl','乙烯基材（成分未注明）',/\bvinyl\b/i],['TPR','热塑性橡胶',/\b(?:tpr|thermoplastic rubber)\b/i],['Chrome','镀铬（基材未注明）',/\bchrome\b/i],['Sand','砂',/\bsand\b/i],['Terylene','涤纶',/\bterylene\b/i],['Chalk','白垩',/\bchalk\b/i],['Catnip','猫薄荷',/\bcatnip\b/i],['Tissue Paper','薄页纸',/\btissue(?: paper)?\b/i],
 ['Nylon / Polyamide','尼龙／聚酰胺',/\b(?:nylon|polyamide)\b/i],['Rubber','橡胶',/\brubber\b/i],['Latex','乳胶',/\blatex\b/i],['Silicone','硅胶',/\bsilicone\b/i],['Concrete','混凝土',/\bconcrete\b/i],['Plaster','石膏',/\bplaster\b/i],['Terracotta','赤陶',/\bterracotta\b/i],['Leather','皮革',/\bleather\b/i],['Cotton Blend','混纺棉',/\bpolycotton\b/i],['Sisal','剑麻',/\bsisal\b/i],['Magnesia','氧化镁',/\bmagnesia\b/i],['Dried Flowers','干花',/\bdried flowers?\b/i],
 ['Glass','玻璃',/\bglass\b/i],['Polyresin','合成树脂',/\bpolyresin\b/i],['Resin','树脂',/\bresin\b/i],['Ceramic','陶瓷',/\bceramic\b/i],['Porcelain','瓷',/\bporcelain\b/i],['Dolomite','白云石陶瓷',/\bdolomite\b/i],['ABS','ABS树脂',/\babs\b/i],['Polycarbonate','聚碳酸酯',/\bpolycarbonate\b/i],['Polystyrene','聚苯乙烯',/\b(?:polystyrene|ps)\b/i],['Foam','泡沫',/\b(?:foam|polyfoam)\b/i],['Copper','铜',/\bcopper\b/i],['Brass','黄铜',/\bbrass\b/i],['Tin','锡',/\btin\b/i],['Zinc','锌',/\bzinc\b/i],['Bamboo','竹',/\bbamboo\b/i],['Cement','水泥',/\bcement\b/i],['Stone','石材',/\bstone\b/i],['Wax','蜡',/\bwax\b/i],['Feather','羽毛',/\bfeathers?\b/i],['Pinecone','松果',/\bpine[ -]?cones?\b/i],['MDF','中密度纤维板',/\bmdf\b/i],['Alloy','合金',/\balloy\b/i],
 ['Polyester','涤纶',/\bpolyester\b/i],['Cotton','棉',/\bcotton\b/i],['Linen','亚麻',/\blinen\b/i],['Jute / Hessian','黄麻／粗麻布',/\b(?:jute|hessian|burlap)\b/i],['Faux Fur','人造毛绒',/\bfaux[ -]fur\b/i],['Velvet','天鹅绒',/\bvelvet\b/i],['Felt','毛毡',/\bfelt\b/i],['Fleece','绒布',/\bfleece\b/i],['Plush','毛绒面料',/\bplush\b/i],['Wool','羊毛',/\bwool\b/i],['Acrylic','腈纶',/\bacrylic\b/i],['Chenille','雪尼尔',/\bchenille\b/i],['Rattan','藤材',/\b(?:rattan|ratten)\b/i],['Willow','柳条',/\bwillow\b/i],['Seagrass','海草',/\bseagrass\b/i],['Paulownia Wood','泡桐木',/\bpaulownia\b/i],['Wood','木材',/\bwood(?:en)?\b/i],['PVC','聚氯乙烯',/\b(?:pvc|polyvinyl chloride)\b/i],['PE','聚乙烯',/\b(?:pe|polyethylene)\b/i],['PET','聚酯树脂',/\bpet\b/i],['Polypropylene','聚丙烯',/\b(?:polypropylene|pp)\b/i],['Cardboard','纸板',/\bcardboard\b/i],['Paper','纸',/\bpaper\b/i],['Iron','铁',/\biron\b/i],['Steel','钢',/\bsteel\b/i],['Aluminium','铝',/\balumin[ui]um\b/i],['Metal','金属',/\bmetal\b/i],['Plastic','塑料',/\bplastic\b/i],['Wicker','编织材质（纤维未注明）',/\bwicker\b/i],['Fabric','织物（纤维未注明）',/\bfabric\b/i]
];
export function materialFacts(specs={},text=''){
 const direct=[specs.Material,specs['Material Composition'],specs.Fabric].filter(Boolean).join(', ');
 const sentences=String(text).split(/(?<=[.!?;])\s+|\n/).filter(s=>(/\b(?:made|crafted|constructed|woven|material|fabric|composition|polyester|cotton|faux fur|hessian|velvet|rattan|willow|paulownia|plastic|metal)\b/i.test(s)||/^\s*-\s/.test(s)&&materialTerms.some(([, ,re])=>re.test(s.split(/\b(?:for|on your|your tree|over the)\b/i)[0])))&&!/\b(?:looks? like|wood[ -]effect|rattan[ -]effect|faux wood|faux rattan|not made|does not contain)\b/i.test(s));
 const relevant=sentences.filter(s=>!/\b(?:decorate your tree|tree branches|branch tips|ornaments you|decorations not|tree not included)\b/i.test(s));
 const evidence=direct+'\n'+relevant.join('\n');
 let found=materialTerms.filter(([, ,re])=>re.test(evidence)).map(([en,zh])=>({en,zh}));
 const has=en=>found.some(x=>x.en===en);const fabricSpecific=['Polyester','Cotton','Linen','Jute / Hessian','Faux Fur','Velvet','Felt','Fleece','Plush','Wool','Acrylic','Chenille'].some(has);
 if(fabricSpecific)found=found.filter(x=>x.en!=='Fabric');if(has('Paulownia Wood')||has('Mango Wood'))found=found.filter(x=>x.en!=='Wood');if(['Iron','Steel','Aluminium'].some(has))found=found.filter(x=>x.en!=='Metal');if(['PVC','PE','PET','Polypropylene'].some(has))found=found.filter(x=>x.en!=='Plastic');if(['Rattan','Willow','Seagrass'].some(has))found=found.filter(x=>x.en!=='Wicker');
 if(has('Acrylic')&&!/\b(?:yarn|knit|fibre|fiber|textile|fabric|wool|cotton)\b/i.test(direct))found=found.map(x=>x.en==='Acrylic'?{en:'Acrylic',zh:'亚克力'}:x);
 if(has('Faux Leather'))found=found.filter(x=>x.en!=='Leather');if(has('Faux Silk'))found=found.filter(x=>x.en!=='Silk');if(has('Paraffin'))found=found.filter(x=>x.en!=='Wax');
 const unknown=direct.split(/[,;|]+/).map(s=>s.trim()).filter(s=>s&&!/^[\d.\s%/+:()\-]+$/.test(s)&&!materialTerms.some(([, ,re])=>re.test(s)));
 const labels=[...found.map(x=>`${x.zh}（${x.en}）`),...unknown.map(s=>`原站材质标注（${s}；composition unspecified）`)];
 return {components:found,unmappedSourceTerms:unknown,label:labels.length?labels.join(' / '):'材质未确认（Not specified）',sourceField:direct||null,descriptionExcerpt:relevant.slice(0,3).join(' ').slice(0,600)};
}
export function descriptionFacts(p,specs={},text=''){
 const name=String(p.variantName||p.name||''),t=name+'\n'+text;const flags={...(p.listingFeatures||p.features||{})};
 const negativeLight=/\b(?:unlit|not pre[ -]?lit|no lights|lights? (?:are )?not (?:included|supplied))\b/i.test(name+' '+text);
 flags.potted=flags.potted||/\b(?:potted (?:christmas )?tree|tree (?:in|with) (?:a |an )?(?:weighted |decorative |cement |ceramic )?pot|weighted (?:pot|base))\b/i.test(t);
 flags.popUp=flags.popUp||/\bpop[ -]?up\b|\bcollapsible (?:christmas )?tree\b/i.test(t);
 flags.slim=flags.slim||/\b(?:slim|pencil|narrow)[ -]?(?:line|profile|design|christmas|tree)\b/i.test(t);
 flags.snow=flags.snow||/\b(?:snow[ -]?(?:flocked|covered|dusted|effect)|flocked branches|frosted tips|snowy (?:christmas )?tree)\b/i.test(t);
 if(/\bnon[ -]flocked\b/i.test(specs.Design||name))flags.snow=false;
 flags.prelit=flags.prelit||/\bpre[ -]?lit\b|\bbuilt[ -]in.{0,30}lights\b|\b(?:\d+)\s*(?:led )?lights (?:included|fitted)\b/i.test(t)||Number(specs['Number of LEDs'])>0;
 if(negativeLight&&!/\bpre[ -]?lit\b/i.test(name)&&!Number(specs['Number of LEDs']))flags.prelit=false;
 const other=/\b(?:arch|birch|twig|willow|palm|cherry blossom|pyramid|wall[ -]mounted|half parasol|wooden silhouette|wooden christmas tree|paper christmas tree|standing paper tree|moon tree|snowman|tree light|wall tree|flagpole|wooden trees|wooden decorative|felt christmas tree|light up christmas pyramid|spindle|silhouette)\b/i.test(name);
 return {flags,otherForm:other,classicTree:/\b(?:christmas tree|artificial tree|pine tree|fir tree|spruce tree)\b/i.test(t),colours:normaliseColors(name),materials:materialFacts(specs,text),descriptionHash:createHash('sha256').update(text).digest('hex')};
}
export function treeStyle(p,visual={}){
 const facts=p.appearanceSource||descriptionFacts(p,p.specifications||{},''),f=facts.flags||p.features||{};
 if(facts.otherForm&&!f.popUp)return TREE_STYLES[6];
 for(const [key,label]of [['potted',TREE_STYLES[0]],['popUp',TREE_STYLES[1]],['slim',TREE_STYLES[2]],['snow',TREE_STYLES[3]],['prelit',TREE_STYLES[4]]])if(f[key])return label;
 if(visual.form==='other'&&!facts.classicTree)return TREE_STYLES[6];
 if(visual.shapeConfidence>=.65&&visual.form==='potted')return TREE_STYLES[0];if(visual.shapeConfidence>=.65&&visual.form==='popup')return TREE_STYLES[1];if(visual.shapeConfidence>=.65&&visual.form==='slim')return TREE_STYLES[2];
 if(visual.classic===true||visual.form==='standard'||facts.classicTree&&visual.form!=='other')return TREE_STYLES[5];
 return TREE_STYLES[6];
}
export function applyAppearance(p,visual={}){
 p.sourceColour??=p.treeColor;p.sourceMaterial??=p.material;
 const colours=[...new Set(visual.colors||[])].filter(x=>PALETTE_ORDER.includes(x));
 p.colorValues=colours.length?colours:normaliseColors(p.sourceColour);p.treeColor=p.colorValues.length?p.colorValues.join(' / '):'颜色待核验';
 p.style=p.kind==='tree'?treeStyle(p,visual):p.style;
 if(['tree','skirt'].includes(p.kind))p.material=p.appearanceSource?.materials?.label||materialFacts(p.specifications||{},'').label;
 p.paletteEvidence={method:visual.method||'visual-model-and-description',version:APPEARANCE_VERSION,imageHash:p.imageCacheEvidence?.sha256,sourceColour:p.sourceColour,colors:p.colorValues,bodyOnly:true,reviewed:visual.reviewed===true,confidence:visual.confidence??null,note:visual.note||null};
 if(p.kind==='tree')p.styleEvidence={method:'description-and-product-image',descriptionHash:p.appearanceSource?.descriptionHash,imageHash:p.imageCacheEvidence?.sha256,category:p.style,sevenCategories:true};
 return p;
}
