import{normaliseColors}from'./appearance.mjs';
export function springBodyColourFacts(p,visual){
 const title=String(p.variantName||'').replace(/\b(?:in|with)\s+(?:a\s+|an\s+|the\s+)?[^;,]{0,70}\b(?:pot|planter|vase|basket|jug)\b.*$/i,''),named=normaliseColors(title),direct=normaliseColors(p.sourceColour||p.specifications?.Colour||p.specifications?.Color),rows=visual?.colours||[],top=rows[0]?.score||0;
 const visible=rows.filter(c=>c.score>=Math.max(.16,top*.65)).map(c=>c.zh),corroborated=named.filter(c=>rows.some(v=>v.zh===c&&v.score>=.10)),supported=direct.filter(c=>rows.some(v=>v.zh===c&&v.score>=.12));
 const colours=[...new Set([...visible,...corroborated,...supported,...(!visible.length?direct:[])])];
 return{colours,sourceColour:p.sourceColour||null,sourceTitle:title,visual:rows,imageHash:visual?.imageHash,method:'exact-SKU-flower-and-leaf-colours-image-plus-title-and-description',note:'统计仿真花叶本体的主要颜色；原站 Colour 字段和容器说明保留在规格中。Major flower/foliage colours; source Colour and container facts remain in original specifications.'};
}
