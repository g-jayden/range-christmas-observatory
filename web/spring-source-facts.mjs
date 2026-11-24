// The Range may append family information for a different plant to the selected
// variant. Keep that raw record, but derive selected-SKU facts from its own fields.
export function springExactVariantSource(p){
 const e=p.detailEvidence,x=e?.exactVariantSource;
 const canonical=raw=>String(raw||'').split('#')[0].replace(/\/$/,'');
 if(!p.detailsReady||!e?.verifiedProductSection||String(e.selectedSku)!==String(p.sku)||String(x?.selectedSku)!==String(p.sku)||String(x.variantId)!==String(p.variantId)||!x.sourceUrl||canonical(x.sourceUrl)!==canonical(p.sourceUrl)||!/^[a-f0-9]{64}$/.test(x.sha256||''))return null;
 return x;
}
export function springSourceText(p){
 const x=springExactVariantSource(p),features=(x?.features||[]).filter(v=>typeof v==='string'&&v.trim());
 if(!x||!features.length&&!x.description?.trim())return String(p.sourceDescription||p.productSummary||'');
 return [features.length?'## Features\n'+features.map(v=>'- '+v).join('\n'):'',x.description?.trim()?'## Information\n'+x.description.trim():''].filter(Boolean).join('\n\n');
}
