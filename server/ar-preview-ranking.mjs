import{previewQualityScore,previewProblems}from'./preview-quality.mjs';
// A high semantic score for branches or a stand is not whole-tree evidence.
// The retailer's hero photo wins only when independent shape/quality supports it.
export function arPreviewScore(p,c,{manual={}}={}){
 const q=c.v.quality||{},shape=c.shape||{},problems=previewProblems(q),hash=c.a.hash,review=manual.approvals?.[hash],selected=manual.selectedPreviews?.[p.sku],whole=c.agreement?.geometryAgreement||shape.heightCoverage>=.58&&shape.aspect>=1.18&&!shape.touchesTop&&!shape.touchesBottom;
 const scores=q.scores||{},hero=p.originalImages?.[0]?.url===c.g.url,blocked=problems.some(x=>['logo','diagram','detail','cropped'].includes(x));
 const detailTree=p.kind==='tree'&&!/\barch(?:way)?\b/i.test(p.variantName)&&shape.aspect<.85&&shape.heightCoverage<.75;
 return previewQualityScore(q)+(c.agreement?.geometryAgreement?.45:0)+(hero&&!blocked&&(whole||p.kind==='tree'&&(scores.whole||0)>=.2&&(scores.detail||0)<.6&&(scores.diagram||0)<.35)?2.5:0)-(detailTree?2.5:0)+(review?.imageSha256===hash&&review.objectType===p.department&&review.wholeObject?3:0)+(selected?.sha256===hash?20:0)-(manual.previewRejected?.some(r=>r.sha256===hash)?10:0);
}
