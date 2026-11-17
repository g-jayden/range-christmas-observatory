export function jlPhysicalObject({name,description:body,groups=[],maxCm=null}){
 const title=String(name||'').toLowerCase(),description=String(body||'').toLowerCase();
 if(/\b(?:halloween|easter|harvest|spring wreath|summer wreath|autumn(?:al)? wreath|diamond art|painting kit|cross stitch|crochet|knitting|felting kit|sewing kit)\b/.test(title)||/\b(?:wreath hanger|wreath hook|storage bag|tree stand|replacement bulb|extension cable|batteries|cushion|bedding|napkin|tablecloth|stockings?|gift sacks?|wrapping paper)\b/.test(title))return [];
 if(/\bbow\b/.test(title)&&/\b(?:front door|dining chair|newel post)\b/.test(description)&&!/\bchristmas tree\b/.test(description))return [];
 if(/\btree (?:skirt|collar)\b/.test(title))return ['jl-skirt'];
 if(/\b(?:tree topper|treetopper)\b/.test(title)||groups.includes('topper')&&/\btop of (?:your|the|a|my) (?:christmas )?tree\b/.test(description))return ['jl-topper'];
 if(/\bwreath\s*(?:and|&)\s*garland\s*(?:set)?\b/.test(title))return ['jl-wreath','jl-garland'];
 if(/\b(?:garlands?|tinsel)\b/.test(title))return ['jl-garland'];
 if(/\bwreath\b/.test(title)&&!/\b(?:candle ring|candle holder|hanging tree)\b/.test(title))return groups.includes('baubles')&&maxCm>0&&maxCm<=25||/wreath.{0,20}(?:tree decoration|tree ornament)/.test(title)?['jl-baubles']:['jl-wreath'];
 if(/\b(?:bauble|tree decoration|tree ornament)\b/.test(title))return ['jl-baubles'];
 if(/\bwreath\b/.test(title)&&groups.includes('baubles')&&maxCm>0&&maxCm<=25)return ['jl-baubles'];
 if(/\bwreath\b/.test(title)&&!/\b(?:candle ring|candle holder|bauble|miniature|mini wreath|hanging tree)\b/.test(title))return ['jl-wreath'];
 if(groups.includes('tree')&&/\btrees?\b/.test(title)&&!/\b(?:shaped|ornament|bauble|decoration|topper)\b/.test(title))return ['jl-tree'];
 if(groups.includes('lights'))return ['jl-lights'];
 if(groups.includes('baubles')&&/\b(?:hanging|baubles?|ornaments?|decorations?|clips?|bows?)\b/.test(title))return ['jl-baubles'];
 if(groups.includes('baubles')&&/\bhang.{0,30}(?:christmas )?tree\b/.test(description))return ['jl-baubles'];
 return [];
}

