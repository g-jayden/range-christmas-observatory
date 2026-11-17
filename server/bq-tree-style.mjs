import{descriptionFacts,treeStyle}from'./appearance.mjs';
export function bqTreeStyle(p,visual={}){
 const title=String(p.baseName||''),head=title.split(/\b(?:with|for|including)\b/i)[0],description=String(p.sourceDescription||''),facts=descriptionFacts({...p,variantName:head},p.specifications,description),evergreen=/\b(?:fir|spruce|pine|needle|foliage)\b/i.test(head);
 const frame=!evergreen&&/\b(?:copper|metal) wire (?:frame|tree)|wireframe tree|\b(?:metal|iron|acrylic|glass|crystal|wooden|felt|paper|tinsel) (?:christmas )?trees?\b/i.test(head+' '+description.split('\n')[0]);
 facts.otherForm ||= frame;
 facts.flags.potted=/\bpotted\b|\bin (?:a |an )?(?:(?:rattan|wicker|woven|decorative|weighted|ceramic|cement|plastic) ){0,3}pot\b/i.test(head)||/\b(?:tree|supplied|comes).{0,45}\b(?:in|with) (?:a |an )?(?:weighted |decorative |cement |ceramic |rattan )?pot\b/i.test(description);
 return treeStyle({...p,appearanceSource:facts},visual);
}
