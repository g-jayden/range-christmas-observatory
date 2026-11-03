import fs from 'node:fs/promises';
import {parseDetails,applyDetails} from './details.mjs';
import {detailFingerprint} from './collection-policy.mjs';
const canonical=url=>{const u=new URL(url);u.hash='';u.search='';u.pathname=u.pathname.replace(/\/$/,'');return u.href;};
// Saved direct-page evidence is reused only for the same source SKU, variant
// and listing photograph. A later successful verification always takes priority.
export async function applySourceRepairs(products){
 const files=await fs.readdir('web/source-repairs').catch(e=>{if(e.code==='ENOENT')return [];throw e;}),families=[];
 for(const file of files.filter(n=>n.endsWith('.json')).sort())families.push(...JSON.parse(await fs.readFile('web/source-repairs/'+file,'utf8')).families);
 let repaired=0;const records=[];
 for(const p of products){if(p.detailsReady||p.detailEvidence?.verifiedProductSection&&!p.detailIssue)continue;
  const f=families.find(f=>canonical(f.evidence.url)===canonical(p.sourceUrl));if(!f)continue;
  const v=f.variants.find(v=>String(v.sku)===String(p.sku));if(!v||p.variantId&&String(v.id)!==String(p.variantId))continue;
  const hero=p.listingVariantImageUrl||p.variantImageUrl;
  if(!f.evidence.gallery.some(g=>g.url===hero&&(!g.variants.length||g.variants.includes(String(v.id)))))continue;
  if(Date.parse(p.attributeObservedAt)>=Date.parse(f.evidence.observedAt))continue;
  const response={success:true,data:{metadata:{statusCode:200},sourceVariant:v,familyEvidence:f.evidence}};
  const d=parseDetails(response,p.sku,p.sourceUrl);applyDetails(p,d);p.sourceDescription=d.featuresText;p.detailsReady=true;p.detailInputFingerprint=detailFingerprint(p);delete p.detailIssue;repaired++;records.push({sku:p.sku,sourceUrl:f.evidence.url,observedAt:d.observedAt});
 }
 return {repaired,records,sourceRequestsMade:false,firecrawlCredits:0};
}
