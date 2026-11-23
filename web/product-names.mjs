import {DEPARTMENT_MAP} from './catalogue-model.mjs';

export const PDF_LAYOUT_VERSION='native-eight-bilingual-names-v6';
import{isSpringScope}from'./spring-model.mjs';
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const concepts=[
 [/\bdark forest green\b/i,'深森林绿'],[/\bsage green\b/i,'鼠尾草绿'],[/\bmonochrome\b/i,'黑白色'],[/\bspots?\b/i,'波点'],[/\bbiscuits?\b/i,'饼干造型'],[/\bbakery\b/i,'烘焙点心造型'],[/\bpersonalised\b|\bpersonalized\b/i,'定制'],[/\bdog breeds?\b/i,'犬种图案'],[/\bcheck(?:ed)?\b/i,'格纹'],
 [/\bnatural charm\b/i,'自然魅力'],[/\bstarry night\b/i,'星夜'],[/\bopulent\b/i,'华丽'],[/\bluxe\b/i,'奢华'],[/\bmajestic\b/i,'华美'],[/\btraditional\b/i,'传统风格'],[/\bvintage\b/i,'复古风格'],[/\brustic\b/i,'乡村风格'],[/\bnordic\b|\bscandi\b/i,'北欧风格'],[/\bmodern\b/i,'现代风格'],[/\bbright\b/i,'明亮色系'],[/\bpearl[ -]look\b/i,'仿珍珠光泽'],[/\bassorted\b/i,'混款'],[/\bfir\b/i,'冷杉'],[/\bspruce\b/i,'云杉'],[/\bpine[ -]?cones?\b/i,'松果'],[/\bpine\b/i,'松树型'],[/\bred berr(?:y|ies)\b/i,'红莓'],
 [/\bhighland cow\b/i,'高地牛'],[/\bgingerbread (?:man|men)\b/i,'姜饼人'],[/\bgingerbread house\b/i,'姜饼屋'],[/\bgingerbread\b/i,'姜饼造型'],[/\bcandy cane\b/i,'拐杖糖'],[/\bnutcracker/i,'胡桃夹子'],[/\bsnowm[ae]n\b/i,'雪人'],[/\bsanta\b|father christmas/i,'圣诞老人'],[/\breindeer\b/i,'驯鹿'],[/\brobin\b/i,'知更鸟'],[/\bpenguin\b/i,'企鹅'],[/\bpolar bear\b/i,'北极熊'],[/\bteddy bear\b/i,'泰迪熊'],[/\b(?:gonk|gnome)s?\b/i,'圣诞地精'],[/\bmushrooms?\b/i,'蘑菇造型'],[/\bangel\b/i,'天使'],[/\bbutterfl(?:y|ies)\b/i,'蝴蝶'],[/\bbirds?\b/i,'小鸟造型'],[/\bsnowflakes?\b/i,'雪花'],[/\bstars?\b/i,'星形'],[/\bbells?\b/i,'铃铛'],[/\bbows?\b/i,'蝴蝶结'],[/\bpine ?cones?\b/i,'松果'],[/\bberr(?:y|ies)\b/i,'浆果'],[/\beucalyptus\b/i,'尤加利叶'],[/\bpoinsettia\b/i,'一品红'],[/\bholly\b/i,'冬青'],[/\bmistletoe\b/i,'槲寄生'],[/\bmoon\b/i,'月亮造型'],[/\blantern\b/i,'灯笼造型'],[/\bbauble\b/i,'球饰'],[/\bhouse\b/i,'小屋造型'],[/\bowl\b/i,'猫头鹰'],[/\bfox\b/i,'狐狸'],[/\bdeer\b/i,'鹿造型'],[/\bsquirrel\b/i,'松鼠'],[/\brocking horse\b/i,'摇摆木马'],[/\btrain\b/i,'火车造型'],[/\bcandy swirls?\b/i,'糖果漩涡'],[/\bcherry\b/i,'樱桃'],[/\bfairy\b/i,'仙女'],[/\bsnow globe\b/i,'雪景球'],[/\bchristmas pudding\b/i,'圣诞布丁'],[/\bchampagne\b/i,'香槟色'],[/\brose gold\b/i,'玫瑰金色'],[/\bburgundy\b/i,'酒红色'],[/\bdusky rose\b/i,'灰玫瑰色'],[/\bsilver\b/i,'银色'],[/\bgold(?:en)?\b/i,'金色'],[/\bpink\b/i,'粉色'],[/\bred\b(?!\s*berr)/i,'红色'],[/\bgreen\b/i,'绿色'],[/\bwhite\b/i,'白色'],[/\bblue\b/i,'蓝色'],[/\bblack\b/i,'黑色'],[/\bbrown\b/i,'棕色'],[/\bgrey\b|\bgray\b/i,'灰色'],[/\bbeige\b/i,'米色'],[/\bcream\b/i,'奶油色'],[/\bmulti(?:colou?r(?:ed)?)?\b(?![ -]*action\b)|\brainbow\b/i,'多彩']
];
const features=[
 [/\bmulti[ -]?action\b/i,'多模式'],[/\bfelt\b/i,'毛毡'],[/\bpaper\b/i,'纸质'],
 [/\bpre[ -]?lit\b/i,'预装灯'],[/\bunlit\b/i,'无灯'],[/\bartificial\b/i,'人造'],[/\bpop[ -]?up\b/i,'折叠展开式'],[/\bslim\b|\bpencil\b/i,'纤细款'],[/\bsnow[ -]?covered\b|\bsnow[ -]?dusted\b|\bsnowy\b|\bflocked\b/i,'覆雪'],[/\bfrosted\b/i,'霜雪效果'],[/\bshatterproof\b/i,'防碎'],[/\bglass\b/i,'玻璃'],[/\bcrackle\b/i,'冰裂纹'],[/\bfaux fur\b/i,'人造毛皮'],[/\bgold plated\b/i,'镀金'],[/\bacrylic\b/i,'亚克力'],[/\bwooden\b/i,'木质'],[/\bceramic\b/i,'陶瓷'],[/\bvelvet\b/i,'天鹅绒'],[/\bknitted\b/i,'针织'],[/\bwicker\b/i,'柳编'],[/\brattan\b/i,'藤编'],[/\bmetallic\b/i,'金属光泽'],[/\bglitter(?:ed)?\b/i,'亮粉'],[/\bsequin(?:ed)?\b/i,'亮片'],[/\binflatable\b/i,'充气'],[/\bbattery(?:[ -]operated)?\b/i,'电池供电'],[/\bsolar\b/i,'太阳能'],[/\banimated\b/i,'动态'],[/\bmusical\b/i,'音乐'],[/\bcolour[ -]?changing\b|\bcolor[ -]?changing\b/i,'变色灯光']
];
function chineseProductName(p,en){
 const reviewed=p.localizedProductName;
 if(reviewed?.sourceName===en&&/[\u3400-\u9fff]/.test(reviewed.zh||''))return clean(reviewed.zh);
 if(isSpringScope(p.department))return springChineseName(p,en);
 if(!/[a-z]/i.test(en)&&/[\u3400-\u9fff]/.test(en))return en;
 const department=p.taxonomyAudit?.primary||p.department||p.kind,label=DEPARTMENT_MAP[department]?.label||'',category=clean(label.split(/\s*·\s*/)[0]),scope=String(department||'').replace(/^(?:asda|ms|bm|hb|du|nx|jl|mt|bq|ar)-/,'');
 let noun=/[\u3400-\u9fff]/.test(category)?category:'圣诞装饰品';
 const treeScope=['tree','trees'].includes(scope),smallTreeDecoration=['tree-decorations','baubles'].includes(scope);
 if(/tree[ -]?skirt/i.test(en))noun='圣诞树裙';else if(/tree[ -]?collar/i.test(en))noun='圣诞树围';else if(/tree[ -]?top(?:per)?\b/i.test(en))noun='圣诞树顶装饰';else if(/tree stand/i.test(en))noun='圣诞树底座';else if(/storage bag/i.test(en))noun='圣诞树收纳袋';
 else if(/wreath (?:hanger|hook)/i.test(en))noun='花环挂钩';
 else if(/\bfairground\b.*\bmodel\b/i.test(en))noun='圣诞游乐场模型';
 else if(/garland/i.test(en))noun='圣诞长藤';
 else if(/wreath/i.test(en))noun=smallTreeDecoration?'花环造型挂饰':'圣诞圈';
 else if(!treeScope&&/\blights?\b/i.test(en)&&(/light/.test(scope)||!/\btree\b/i.test(en)))noun=category.includes('灯')?category:'圣诞灯饰';
 else if(/lantern/i.test(en))noun='圣诞灯笼';else if(/candle holder|candlestick|candelabra/i.test(en))noun='圣诞烛台';else if(/stocking/i.test(en))noun='圣诞袜';
 else if(/bauble/i.test(en))noun='圣诞装饰球';
 else if(/\brose\b(?!\s*gold).*\bclips?\b/i.test(en))noun='玫瑰花夹';
 else if(!treeScope&&/tree(?: [a-z-]+){0,4} decorations?/i.test(en))noun='圣诞树装饰';
 else if(!treeScope&&/hanging decorations?|hanging ornaments?/i.test(en))noun='圣诞挂饰';
 else if(!treeScope&&/ornament/i.test(en))noun='圣诞装饰品';
 if(/\b(?:set|pack)\b/i.test(en)&&/\bwreath\b/i.test(en)&&/\bgarland\b/i.test(en))noun='圣诞圈与长藤套装';
 const namingText=en.replace(/\bwarm white\b/ig,'暖白光').replace(/\bcool white\b/ig,'冷白光'),spans=[],shape=[];for(const[pattern,zh]of concepts){const found=pattern.exec(namingText);if(!found||spans.some(([a,b])=>found.index<b&&found.index+found[0].length>a))continue;spans.push([found.index,found.index+found[0].length]);if(!noun.includes(zh)&&!(zh==='球饰'&&noun.includes('球')))shape.push(zh);}
 const attributes=features.filter(([pattern,zh])=>pattern.test(en)&&!noun.includes(zh)).map(([,zh])=>zh);
 if(/\bnon[ -]flocked\b/i.test(en)){const at=attributes.indexOf('覆雪');if(at>=0)attributes.splice(at,1);}
 const size=en.match(/\b(\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?){0,3})\s*(ft|feet|foot|cm|mm|inch|inches|m)\b/i),unit={ft:'英尺',feet:'英尺',foot:'英尺',cm:'厘米',mm:'毫米',inch:'英寸',inches:'英寸',m:'米'};
 const pack=en.match(/\b(?:set|pack)\s+of\s+(\d+)\b/i)||en.match(/\b(\d+)\s*(?:[ -]pack|pieces?|pcs?)\b/i),led=en.match(/\b(\d+)\s*(?:(?:warm|cool) white\s*)?(?:[ -])?leds?\b/i);
 const colours={green:'绿色',red:'红色',white:'白色',black:'黑色',pink:'粉色',blue:'蓝色',navy:'海军蓝色',grey:'灰色',gray:'灰色',gold:'金色',silver:'银色',brown:'棕色',beige:'米色',cream:'奶油色',orange:'橙色',purple:'紫色',clear:'透明色',natural:'原色',multi:'多色',multicolour:'多色'};
 const colour=en.match(/\s[-·/]\s*(green|red|white|black|pink|blue|navy|grey|gray|gold|silver|brown|beige|cream|orange|purple|clear|natural|multi|multicolour)(?:\s*\/\s*\d[^a-z]*)?\s*$/i);
 if(!['tree','trees'].includes(scope)){const at=shape.indexOf('松树型');if(at>=0)shape[at]='松枝';}
 const warm=/\bwarm white\b/i.test(en)?'暖白光':/\bcool white\b/i.test(en)?'冷白光':'';
 const light=/\bleds?\b/i.test(en)&&!led?'LED':'';
 const title=[size?size[1]+unit[size[2].toLowerCase()]:'',...attributes,...new Set([colour?colours[colour[1].toLowerCase()]:'',...shape,light,warm].filter(Boolean)),noun].filter(Boolean).join('');
 return title+(pack?'（'+pack[1]+'件套）':'')+(led?'（'+led[1]+'颗LED）':'');
}
export function productNames(p){
 const en=clean(p.variantName||p.name||p.title||p.baseName)||'Product '+String(p.sourceSku||p.sku||'');
 return {en,zh:chineseProductName(p,en)};
}

function springChineseName(p,en){
 const species=[[/gypsophila/i,'满天星'],[/hydrangea/i,'绣球花'],[/eucalyptus/i,'尤加利'],[/peon(?:y|ies)/i,'牡丹'],[/tulip/i,'郁金香'],[/orchid/i,'兰花'],[/cherry blossom/i,'樱花'],[/blossom/i,'花枝'],[/magnolia/i,'玉兰'],[/rose/i,'玫瑰'],[/lavender/i,'薰衣草'],[/lily|lilies/i,'百合'],[/delphinium/i,'飞燕草'],[/dais(?:y|ies)/i,'雏菊'],[/petunia/i,'矮牵牛'],[/sunflower/i,'向日葵'],[/olive/i,'橄榄'],[/ficus/i,'榕树'],[/palm/i,'棕榈'],[/bamboo/i,'竹'],[/fern/i,'蕨类'],[/succulent/i,'多肉'],[/cactus|cacti/i,'仙人掌'],[/monstera/i,'龟背竹'],[/ivy/i,'常春藤'],[/boxwood/i,'黄杨'],[/bay tree/i,'月桂'],[/wisteria/i,'紫藤'],[/lemon/i,'柠檬'],[/dahlia/i,'大丽花'],[/chrysanthemum/i,'菊花'],[/poppy/i,'罂粟花']];
 const subject=species.find(([re])=>re.test(en))?.[1]||(/flower|floral/i.test(en)?'花卉':'绿植');
 const noun=p.department==='spring-tree'?'仿真树':p.department==='spring-wreath-garland'?(/wreath/i.test(en)?'仿真花环':'仿真长藤'):p.department==='spring-potted'?(/vase/i.test(en)?'瓶插花艺':'仿真盆栽'):/bouquet|bunch/i.test(en)?'仿真花束':'仿真单枝';
 const colours={pink:'粉色',white:'白色',purple:'紫色',yellow:'黄色',blue:'蓝色',green:'绿色',cream:'奶油色',red:'红色',orange:'橙色'},colour=en.match(/(?:^|\W)(pink|white|purple|yellow|blue|green|cream|red|orange)(?:$|\W)/i),size=en.match(/\b(\d+(?:\.\d+)?)\s*(cm|mm|m|ft)\b/i),pack=en.match(/(?:pack|set) of (\d+)|(\d+) pack/i);
 return [colour?colours[colour[1].toLowerCase()]:'',subject,noun,size?'（'+size[1]+({cm:'厘米',mm:'毫米',m:'米',ft:'英尺'}[size[2].toLowerCase()])+'）':'',pack?'（'+(pack[1]||pack[2])+'件套）':''].join('');
}
