import {sourceColours} from './decorations.mjs';
import {duMaterialFacts} from './du-materials.mjs';
export function nextBodyPalette(p,visual){
 const lit=/pre.?lit|\bLED\b|\blights?\b/i.test(p.variantName+' '+p.sourceDescription);
 const clean=t=>lit?String(t||'').replace(/(?:warm\s+white|white\s+warm|cool\s+white|bright\s+white|multi(?:.?colou?red)?\s+lights?)/ig,' '):String(t||'');
 const colour=clean(p.sourceColour),facts=sourceColours({...p,department:p.department?.replace(/^(?:nx|jl)-/,''),variantName:clean(p.variantName),sourceColour:colour,specifications:{...p.specifications,Colour:colour,Color:colour}});
 const seen=visual.colors||[],family=c=>/灰/.test(c)?'grey':c,agree=facts.named.some(c=>seen.some(v=>family(c)===family(v)));
 let colors=facts.conflict&&agree?seen:facts.explicitTitleColours?facts.named:facts.reliable?facts.specified:facts.described.length?facts.described:facts.named.length?facts.named:seen;
 if(/snow|frost|flock/i.test(p.variantName)&&seen.length>1&&colors.every(c=>seen.includes(c)))colors=seen;
 return {colors:[...new Set(colors)],evidence:{method:'official-body-colour-title-description-and-original-image',source:p.sourceColour,bodyOnly:true,lampColourTextExcluded:lit&&colour!==p.sourceColour,sourceConflict:facts.conflict,confidence:visual.colourConfidence,needsReview:!facts.reliable&&!facts.named.length&&!facts.described.length&&(visual.colourConfidence||0)<.35}};
}
export function nextMaterialFacts(specs,description){
 const facts=duMaterialFacts(specs,description),explicit=[];
 for(const [en,zh,re]of [['Other fibres','其它纤维（纤维成分未说明）',/other fibres?/i],['Dried Floral','干燥花材',/dried floral/i]])if(re.test(specs.Material||'')){facts.components=facts.components.filter(v=>!re.test(v.en));explicit.push({en,zh});}
 // These are literal polymer names in construction descriptions, not image inference.
 if(!specs.Material)for(const sentence of String(description).split(/[\n.!;]/)){
  if(/matching|pair with|coordinate|sold separately|not included/i.test(sentence))continue;
  for(const [en,zh,re]of [['PVC','聚氯乙烯',/\b(?:PVC|polyvinyl chloride)\b/],['PE','聚乙烯',/\b(?:PE|polyethylene)\b/]])if(re.test(sentence))explicit.push({en,zh});
 }
 const components=[...new Map([...facts.components,...explicit].map(v=>[v.en,v])).values()];
 return {...facts,components,label:components.length?components.map(v=>v.zh+'（'+v.en+'）').join(' / '):facts.label};
}
