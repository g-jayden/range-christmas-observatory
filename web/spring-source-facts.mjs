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
 const page=x?.singleSkuPageInformation,canonical=raw=>String(raw||'').split('#')[0].replace(/\/$/,'');
 const exactPage=x&&!x.descriptionOverride&&page?.htmlVerified===true&&String(page.selectedSku)===String(p.sku)&&String(page.variantId)===String(p.variantId)&&String(page.productId)===String(p.id)&&canonical(page.sourceUrl)===canonical(p.sourceUrl)&&page.variantSkus?.length===1&&String(page.variantSkus[0])===String(p.sku)&&page.offerSkus?.length===1&&String(page.offerSkus[0])===String(p.sku);
 const description=x?.description?.trim()||(exactPage?String(page.text||'').trim():'');
 if(!x||!features.length&&!description)return String(p.sourceDescription||p.productSummary||'');
 return [features.length?'## Features\n'+features.map(v=>'- '+v).join('\n'):'',description?'## Information\n'+description:''].filter(Boolean).join('\n\n');
}
