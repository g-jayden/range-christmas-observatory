// These full-product views were visually reviewed for the user's examples.
// They expire automatically if the exact SKU's verified gallery changes.
export const REVIEWED_WHOLE_SOURCES={
 '1492333':'https://www.therange.co.uk/media/7/8/1792876204_2772.jpg',
 '1459857':'https://www.therange.co.uk/media/7/4/1787119137_4695.jpg',
 '474493':'https://www.therange.co.uk/media/8/5/1758265760_11_5313.jpg',
 '3414647':'https://www.therange.co.uk/media/2/6/1793701706_9756.jpg'
};
export function reviewedWholeGalleryPhoto(p,gallery=p.originalImages||[]){
 if(p.displayImage||(p.retailerId||'the-range')!=='the-range')return null;
 const desired=REVIEWED_WHOLE_SOURCES[p.sku];if(!desired)return null;
 return gallery.find(g=>g.url===desired&&(g.selectedSku!=null?String(g.selectedSku)===String(p.sku):p.variantId!=null&&String(g.variantId)===String(p.variantId)&&p.detailEvidence?.verifiedProductSection===true&&String(p.detailEvidence.selectedSku)===String(p.sku)))||null;
}
