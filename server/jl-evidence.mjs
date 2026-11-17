export function mergeJlEvidence(evidence,d){
 if(!/^\d{8}$/.test(d.productCode||''))throw Error('John Lewis product code must come from its separate eight-digit field');
 if(!d.pageId||!d.sourceUrl||!d.sourceUrl.includes('/p'+d.pageId))throw Error('John Lewis selected page identity mismatch');
 const ranged=/£[\d,.]+\s*[–-]\s*£[\d,.]+/.test(d.priceText||'');
 if(ranged){evidence.familySelections||={};evidence.familySelections[d.sourceUrl]=d;return 'family-needs-size-selection';}
 const prior=evidence.products[d.productCode];
 if(prior&&/£[\d,.]+\s*[–-]\s*£[\d,.]+/.test(prior.priceText||'')){evidence.familySelections||={};evidence.familySelections[prior.sourceUrl]=prior;}
 else if(prior&&JSON.stringify(prior.specifications)!==JSON.stringify(d.specifications)){
  evidence.conflicts.push({productCode:d.productCode,priorUrl:prior.sourceUrl,url:d.sourceUrl});return 'specification-conflict';
 }
 evidence.products[d.productCode]=d;return 'selected-variant';
}
