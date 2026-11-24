import {detailFingerprint} from './collection-policy.mjs';
import {springSourceDecision} from '../web/spring-model.mjs';
// Targeted source repairs can finish while a photo review is running. Apply
// only exact-SKU detail fields, never an older copy of prices, NEW history,
// stock or already-downloaded native files from that independent repair job.
export function applySavedSpringSourcePatches(snapshot,patch){
 const report={applied:0,rejected:[],sourceRequests:0,firecrawlCredits:0};
 if(!patch||patch.baseObservedAt!==snapshot.observedAt)return report;
 const by=new Map(snapshot.products.map(p=>[String(p.sku),p]));
 const fields=['sourceUrl','sourceDescription','dimensions','material','colorValues','treeColor','detailsReady','detailEvidence','sourceAddressRepair','attributeObservedAt','productSummary','specifications','descriptionHash','heightLabel','heightCm','heightValues','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm','features','appearanceSource','sourceColour','sourceMaterial','originalImages','originalSourceEvidence'];
 for(const record of patch.products||[]){
  const p=by.get(String(record.sku));if(!p||p.detailsReady)continue;
  const proof=record.sourceAddressRepair,d=record.detailEvidence,exact=d?.exactVariantSource;
  let validOrigin=false;try{const u=new URL(record.sourceUrl);validOrigin=u.origin==='https://www.therange.co.uk'&&!u.username&&!u.password;}catch{}
  if(!validOrigin||!record.detailsReady||String(record.variantId)!==String(p.variantId)||proof?.rawSourceUrl!==p.sourceUrl||proof?.sourceUrl!==record.sourceUrl||String(proof?.verifiedSku)!==String(p.sku)||String(proof?.variantId)!==String(p.variantId)||d?.verifiedProductSection!==true||String(d.selectedSku)!==String(p.sku)||String(exact?.selectedSku)!==String(p.sku)||String(exact?.variantId)!==String(p.variantId)||!/^[a-f0-9]{64}$/.test(d.sourceContentHash||'')){
   report.rejected.push({sku:String(record.sku),reason:'source-repair-identity-or-proof-changed'});continue;
  }
  for(const field of fields)if(Object.hasOwn(record,field))p[field]=structuredClone(record[field]);
  if(!p.originalImageEvidence&&record.originalImageUrl)p.originalImageUrl=record.originalImageUrl;
  p.detailInputFingerprint=detailFingerprint(p);p.springCandidate=springSourceDecision(p);delete p.detailIssue;delete p.detailError;report.applied++;
 }
 return report;
}
