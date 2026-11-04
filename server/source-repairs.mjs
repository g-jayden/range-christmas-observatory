import fs from 'node:fs/promises';
import {parseDetails,applyDetails} from './details.mjs';
import {detailFingerprint} from './collection-policy.mjs';
import {selectOriginals,applyOriginal} from './original-images.mjs';
import {atomicJson} from './sync.mjs';
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

export async function applySourceOriginalRepairs(products){
 const files=await fs.readdir('web/source-repairs').catch(e=>{if(e.code==='ENOENT')return [];throw e;}),families=new Map(),buckets=new Map();
 for(const file of files.filter(n=>n.endsWith('.json')).sort())for(const f of JSON.parse(await fs.readFile('web/source-repairs/'+file,'utf8')).families)families.set(canonical(f.evidence.url),f);
 let restored=0;const structuredOnly=[];
 for(const p of products){const f=families.get(canonical(p.sourceUrl));if(!f)continue;
  if(p.originalSourceEvidence&&Date.parse(p.originalSourceEvidence.observedAt)>=Date.parse(f.evidence.observedAt))continue;
  const v=f.variants.find(v=>String(v.sku)===String(p.sku));if(!v||p.variantId&&String(v.id)!==String(p.variantId))continue;
  parseDetails({success:true,data:{metadata:{statusCode:200},sourceVariant:v,familyEvidence:f.evidence}},p.sku,p.sourceUrl);
  const single=f.variants.length===1&&f.evidence.offers.length===1&&f.evidence.offers[0].sku===p.sku;
  const hero=p.listingVariantImageUrl||p.variantImageUrl;
  if(!f.evidence.gallery.some(g=>g.url===hero&&(single||g.variants.includes(String(v.id))))&&!f.evidence.offers.some(o=>o.sku===p.sku&&o.image===hero)&&!(single&&(f.evidence.structuredOriginalImages||[]).includes(hero)))continue;
  let pairs=(f.evidence.originalGallery||[]).map(g=>({...g,variants:g.variants.length?g.variants:single?[String(v.id)]:[]})),method='official-page-navigation-exact-SKU-gallery';
  if(!pairs.length&&single){pairs=(f.evidence.structuredOriginalImages||[]).map(url=>({url,thumbnail:url,variants:[String(v.id)]}));method='official-single-SKU-structured-images';}
  const saved=selectOriginals({...p,variantId:String(v.id)},{url:f.evidence.url,status:200,product:true,offers:f.variants.map(v=>String(v.sku)),pairs});if(!saved)continue;
  Object.assign(saved,{observedAt:f.evidence.observedAt,method});if(!applyOriginal(p,saved))continue;
  const key=p.sku.slice(-2).padStart(2,'0');if(!buckets.has(key))buckets.set(key,await fs.readFile('web/original-image-map/'+key+'.json','utf8').then(JSON.parse).catch(()=>({})));
  buckets.get(key)[p.sku]=saved;restored++;if(method==='official-single-SKU-structured-images')structuredOnly.push({sku:p.sku,sourceUrl:f.evidence.url,originalImageUrl:p.originalImageUrl});
 }
 for(const [key,bucket]of buckets)await atomicJson('web/original-image-map/'+key+'.json',bucket);
 return {restored,structuredOnly,sourceRequestsMade:false,firecrawlCredits:0};
}
