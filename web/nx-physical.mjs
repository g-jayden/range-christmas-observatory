export function nxPhysicalObject({name='',description='',groups=[],maxCm=null}){
 const t=name.toLowerCase(),text=(name+' '+description).toLowerCase(),head=t.split(/\bwith\b/)[0];
 if(/\b(?:halloween|easter|spring|pumpkin|duvet|bedding|pillowcase|pyjamas|pajamas|storage bag|wreath hanger|wreath hook|gift wrap|wrapping paper)\b/.test(t))return [];
 if(/\b(?:autumn(?:al)?|harvest)\b/.test(t)&&!/\bchristmas\b/.test(t))return [];
 if(/\bbundle\b/.test(t)&&/wreath/.test(description)&&/garland/.test(description)&&/potted Christmas trees/i.test(description))return ['nx-wreath','nx-garland','nx-tree'];
 if(/\bwreath\b.*\bbaubles?\b/.test(t)&&!/\bset\b.*wreath/.test(t))return ['nx-baubles'];
 if(/\bgarlands?\b/.test(t)||/\btinsel\b/.test(t)&&!/\btrees?\b/.test(head))return /\bwreaths?\b/.test(t)&&/\bset\b/.test(t)?['nx-garland','nx-wreath']:['nx-garland'];
 if(/\bswags?\b/.test(head))return ['nx-ornaments'];
 if(groups.includes('nx-garland')&&/\bgarland\b/.test(description.toLowerCase()))return ['nx-garland'];
 if(/\bwall lights\b/.test(t))return ['nx-ornaments'];
 const hanging=/hanging ornament|\bbaubles?\b|clip.on/.test(t)||/\bhang.{0,30}(?:christmas )?tree\b|to your christmas tree/.test(description.toLowerCase());
 if(/\bwreath\b/.test(t))return /wreath.{0,20}(?:tree decoration|tree ornament)/.test(t)||maxCm>0&&maxCm<25&&groups.includes('nx-baubles')?['nx-baubles']:['nx-wreath'];
 if(groups.includes('nx-tree')&&!/\b(?:candle|cushion|figurine|ornaments?|topper|skirt|collar|napkin|baubles?)\b/.test(head)&&/\btrees?\b/.test(head))return ['nx-tree'];
 if(groups.includes('nx-baubles')||hanging)return ['nx-baubles'];
 if(/\bplush\b/.test(t)&&/christmas/.test(t))return ['nx-ornaments'];
 if(groups.includes('nx-ornaments')&&!/\b(?:mug|plate|dinner|glassware|tea towel|tablecloth|cushion|blanket|throw|stocking|gift sack|wreath hanger)\b/.test(t))return ['nx-ornaments'];
 return [];
}
