import path from 'node:path';
const COLORS=[['green',['绿色']],['white',['白色']],['black',['黑色']],['dark charcoal grey',['深空灰色']],['grey',['灰色']],['pink',['粉色']],['red',['红色']],['brown',['褐色']],['beige',['褐色']],['gold',['金色']],['silver',['银色']],['blue',['蓝色']],['navy blue',['蓝色']],['purple',['紫色']],['orange',['橙色']],['yellow',['黄色']],['red and white',['红色','白色']],['red and green',['红色','绿色']],['green and white',['绿色','白色']],['white and silver',['白色','银色']],['red and gold',['红色','金色']],['black and white',['黑色','白色']],['brown and white',['褐色','白色']],['pink and white',['粉色','白色']],['red and black',['红色','黑色']],['pink and red',['粉色','红色']]];
const SHAPES=[['potted','a small Christmas tree supplied in a plant pot'],['popup','a collapsible pop-up tinsel spiral Christmas tree'],['slim','a very narrow pencil shaped Christmas tree'],['snow','a full Christmas pine tree with snow flocked branches'],['prelit','a full Christmas pine tree with built-in string lights'],['standard','a plain full shape traditional artificial pine Christmas tree'],['other','an ornamental bare twig birch wooden arch cone or silhouette tree']];
let engine;
async function classifier(){if(!engine)engine=(async()=>{const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir=path.resolve('runtime/models');return pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{dtype:'q8',device:'cpu'})})();return engine;}
export async function analyseImage(p,imageFile){
 const model=await classifier(),noun=p.kind==='skirt'?'Christmas tree skirt or tree collar':'artificial Christmas tree';
 const choices=COLORS.map(([color])=>`a ${color} ${noun}`),scores=await model(imageFile,choices);
 const top=scores[0],match=COLORS[choices.indexOf(top.label)];
 let form,shapeScores=[];if(p.kind==='tree'){shapeScores=await model(imageFile,SHAPES.map(x=>x[1]));form=SHAPES.find(x=>x[1]===shapeScores[0].label)?.[0];}
 return {colors:match[1],form,classic:p.kind==='tree'&&form!=='other',confidence:top.score,shapeConfidence:shapeScores[0]?.score,method:'local-CLIP-image-plus-description',reviewed:false,top:scores.slice(0,3).map(x=>({colors:COLORS[choices.indexOf(x.label)][1],score:Math.round(x.score*1000)/1000}))};
}
