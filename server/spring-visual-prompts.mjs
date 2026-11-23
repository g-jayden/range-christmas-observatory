export const SPRING_SEASONS=[['freshFlowers','a spring floral arrangement with fresh green leaves and colourful or pastel flowers'],['greenFoliage','a lush green artificial houseplant, green tree or fresh green foliage wreath or garland'],['autumn','an autumn decoration with brown, orange and rusty dried leaves or pumpkins'],['christmas','a Christmas decoration with snow, holly, pine cones or Christmas baubles'],['dried','a dried brown pampas grass or beige dried floral arrangement'],['other','an empty vase, a plant stand, a brand logo, a diagram or unrelated home accessory']];
export const SPRING_OBJECTS=[['spring-stems','a bouquet, bunch of flowers, floral stems, branches, picks or sprays without a pot'],['spring-potted','an artificial potted houseplant or flowers already arranged inside a vase or pot'],['spring-wreath-garland','a wreath ring or a long floral or foliage garland'],['spring-tree','a whole artificial indoor tree with a trunk and green foliage'],['other','an empty vase, plant stand or other household accessory without an artificial plant']];
export const SPRING_COLOURS=[['绿色','green'],['白色','white'],['粉色','pink'],['紫色','purple'],['黄色','yellow'],['蓝色','blue'],['红色','red'],['橙色','orange'],['褐色','brown'],['奶油色','cream']].map(([id,colour])=>[id,'the main artificial flowers or leaves are '+colour+', ignoring the background and the container']);
export const SPRING_VISUAL_PROMPTS=[...SPRING_SEASONS,...SPRING_OBJECTS,...SPRING_COLOURS].map(x=>x[1]);
// CLIP's softmax scores can be conditioned on each label group exactly:
// p(label)/sum(p(group)) equals a separate softmax over that group. The same
// source image is encoded once for season, physical form and colours.
export function springVisualScores(results){
 const score=new Map(results.map(r=>[r.label,r.score]));
 const group=labels=>{if(labels.some(([,label])=>!Number.isFinite(score.get(label))||score.get(label)<0))throw Error('Complete spring visual scores required');const sum=labels.reduce((n,[,label])=>n+score.get(label),0);if(!(sum>0))throw Error('Nonzero spring visual scores required');return labels.map(([id,label])=>({id,score:score.get(label)/sum})).sort((a,b)=>b.score-a.score);};
 return{season:Object.fromEntries(group(SPRING_SEASONS).map(s=>[s.id,s.score])),objects:group(SPRING_OBJECTS),colours:group(SPRING_COLOURS).slice(0,3).map(s=>({zh:s.id,score:s.score}))};
}
