import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {descriptionFacts,treeStyle,materialFacts} from './appearance.mjs';
import {productDimensions} from '../web/catalogue-model.mjs';
import {atomicJson} from './sync.mjs';
import {DEPARTMENTS} from '../web/catalogue-model.mjs';
import {TAXONOMY_VERSION,offeredObject,christmasEligibility,objectMemberships,productBody,productDescription} from '../web/taxonomy.mjs';
import {auditProductImages,readTaxonomyImageCache,VISION_VERSION} from './taxonomy-vision.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const taxonomyFingerprint=p=>hash([TAXONOMY_VERSION,p.sku,productBody(p),productDescription(p),p.specifications||{},p.displayImage?.sha256||p.imageCacheEvidence?.sha256,p.kind,p.lightingDepartmentIds,p.themeIds]);
const read=async(file,fallback)=>fs.readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return fallback;});
const clone=p=>structuredClone(p);
export async function auditTaxonomy(snapshots,{infer=true,writeViews=true}={}){
 const bySku=new Map(),sourceNames=['trees-skirts','decorations','lights','themes'];
 for(let i=0;i<snapshots.length;i++)for(const p of snapshots[i]?.products||[]){if(!bySku.has(p.sku))bySku.set(p.sku,[]);bySku.get(p.sku).push({p,source:sourceNames[i]});}
 const canonical=[],before=new Map();
 for(const [sku,records]of bySku){
  const sorted=[...records].sort((a,b)=>(b.p.detailEvidence?.verifiedProductSection?10:0)+(productDescription(b.p)?3:0)+(b.source==='trees-skirts'?2:0)-((a.p.detailEvidence?.verifiedProductSection?10:0)+(productDescription(a.p)?3:0)+(a.source==='trees-skirts'?2:0)));
  const p=clone(sorted[0].p),latest=[...records].sort((a,b)=>Date.parse(b.p.observedAt)-Date.parse(a.p.observedAt))[0].p;
  for(const k of ['priceGBP','originalPrice','promoText','observedAt','newStatus','newEvidence'])if(latest[k]!==undefined)p[k]=clone(latest[k]);
  const tree=records.find(r=>r.source==='trees-skirts');if(tree){p.kind=tree.p.kind;for(const k of ['style','heightLabel','heightCm','heightValues','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm'])if(tree.p[k]!==undefined)p[k]=clone(tree.p[k]);}
  p.lightingDepartmentIds=[...new Set(records.flatMap(r=>r.p.lightingDepartmentIds||[]))];p.themeIds=[...new Set(records.flatMap(r=>r.p.themeIds||[]))];
  p.taxonomySources=records.map(r=>r.source);before.set(sku,{primary:sorted[0].p.department,ids:[...new Set(records.flatMap(r=>[r.p.department,...r.p.departmentIds||[],...(['tree','skirt'].includes(r.p.kind)?[r.p.kind]:[])]).filter(Boolean))]});
  canonical.push(p);
 }
 let baseline;try{baseline=JSON.parse(gunzipSync(await fs.readFile('web/taxonomy-baseline.json.gz')));}catch(e){if(e.code!=='ENOENT')throw e;}if(baseline?.version===TAXONOMY_VERSION)for(const p of canonical)if(baseline.records[p.sku])before.set(p.sku,baseline.records[p.sku]);
 const overrides=await read('web/taxonomy-overrides.json',{products:{}});
 for(const p of canonical){
  const o=overrides.products[p.sku],d=o?.displayImage;
  if(d&&o.title===productBody(p)&&d.selectedSku===p.sku&&d.sourceInputImageUrl===(p.listingVariantImageUrl||p.variantImageUrl)){
   const bytes=await fs.readFile('web/'+d.cachePath);if(createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw Error('Reviewed source image digest mismatch: '+p.sku);
   p.displayImage=d;p.originalImageUrl=d.sourceUrl;p.originalCachedImageUrl=d.cachePath;
   if(d.colors){p.colorValues=d.colors;p.treeColor=d.colors.join(' / ');}
   if(d.verifiedSpecifications){p.retailerSpecificationConflicts||={};for(const [k,v]of Object.entries(d.verifiedSpecifications))if(p.specifications?.[k]!==v)p.retailerSpecificationConflicts[k]=p.specifications?.[k]||null;
    p.specifications={...p.specifications,...d.verifiedSpecifications};for(const k of d.invalidSourceFields||[]){p.retailerSpecificationConflicts[k]??=p.specifications[k];p.specifications[k]='原站数据异常，未采用 · Invalid source value; not used';}
    p.specificationCorrections={source:d.sourceProductUrl,model:d.manufacturerModel,verifiedAt:d.verifiedAt,fields:Object.keys(d.verifiedSpecifications),invalidSourceFields:d.invalidSourceFields};p.material=materialFacts(p.specifications,productDescription(p)).label;p.dimensions=productDimensions(p.specifications,productDescription(p));
   }
  }else delete p.displayImage;
 }
 const imageAudit=infer?await auditProductImages(canonical):{uniqueImages:0,analysed:0,reused:0,unavailableSkus:[],firecrawlCredits:0};
 if(!infer){const cache=await readTaxonomyImageCache();for(const p of canonical)if(cache.version===VISION_VERSION)p.taxonomyVisual=cache.entries[p.displayImage?.sha256||p.imageCacheEvidence?.sha256];}
 const index={},excluded=[],review=[],moved=[];
 for(const p of canonical){
  const fingerprint=taxonomyFingerprint(p),visual=p.taxonomyVisual,override=overrides.products[p.sku],validOverride=override&&override.imageHash===p.imageCacheEvidence?.sha256&&override.title===productBody(p);
  let object=offeredObject(p),eligibility=christmasEligibility(p,object,visual);
  if(validOverride){object={...object,...override.object,method:'source-image-and-exact-SKU-reviewed'};if(override.disposition)eligibility={disposition:override.disposition,reason:override.reason,evidence:override.evidence};}
  const memberships=objectMemberships(p,object),audit={version:TAXONOMY_VERSION,inputFingerprint:fingerprint,title:productBody(p),imageHash:p.displayImage?.sha256||p.imageCacheEvidence?.sha256||null,primary:object.id,memberships,disposition:eligibility.disposition,reason:eligibility.reason,objectReason:object.reason,subtype:object.subtype||null,evidence:eligibility.evidence,objectEvidence:object.evidence,descriptionVerified:Boolean(p.detailEvidence?.verifiedProductSection&&String(p.detailEvidence.selectedSku)===p.sku),imageAnalysed:Boolean(visual),imageMethod:visual?.method||'source-image-unavailable',imageObjects:visual?.objects?.slice(0,3)||[],imageSeasons:visual?.seasons?.slice(0,3)||[],humanReviewed:Boolean(validOverride),reviewNote:validOverride?override.note||null:null};
  p.taxonomyAudit=audit;p.department=object.id;p.departmentIds=memberships;p.classificationEvidence={id:object.id,method:object.method,reason:object.reason,matched:object.evidence};
  if(['tree','skirt'].includes(object.id))p.kind=object.id;
  if(object.id==='tree'&&!p.style){const facts=descriptionFacts(p,p.specifications||{},productDescription(p)),title=productBody(p);if(/\b(?:gold wire|wire light|cone)\b/i.test(title))facts.otherForm=true;if(/\b(?:flocked|snowy|snow covered)\b/i.test(title)&&!/\bnon[ -]flocked\b/i.test(title))facts.flags.snow=true;if(/\b(?:in|with) (?:a )?(?:rattan )?pot\b/i.test(title))facts.flags.potted=true;p.appearanceSource=facts;p.style=treeStyle(p);p.heightCm=p.dimensions?.values?.Height||p.heightCm;p.heightLabel=p.specifications?.Height||p.heightLabel;p.styleEvidence={method:'exact-SKU-description-and-audited-source-image',category:p.style,sevenCategories:true};}

  index[p.sku]=audit;
  const entry={sku:p.sku,title:p.variantName,sourceUrl:p.sourceUrl,image:p.cachedImageUrl,from:before.get(p.sku),to:memberships,primary:object.id,reason:eligibility.reason,objectReason:object.reason};
  if(eligibility.disposition==='exclude')excluded.push(entry);else if(eligibility.disposition==='review')review.push(entry);
  else if(before.get(p.sku).ids.some(id=>!memberships.includes(id))||memberships.some(id=>!before.get(p.sku).ids.includes(id)))moved.push(entry);
 }
 const lookup=new Map(canonical.map(p=>[p.sku,p]));
 for(const snapshot of snapshots.filter(Boolean))for(const p of snapshot.products){const q=lookup.get(p.sku);for(const k of ['taxonomyAudit','department','departmentIds','classificationEvidence','displayImage'])p[k]=q[k]===undefined?undefined:clone(q[k]);if(['tree','skirt'].includes(q.department)){p.kind=q.kind;for(const k of ['style','heightCm','heightLabel','heightValues','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm'])if(q[k]!==undefined)p[k]=clone(q[k]);}if(q.displayImage){for(const k of ['colorValues','treeColor','originalImageUrl','originalCachedImageUrl','specifications','material','dimensions','specificationCorrections','retailerSpecificationConflicts'])if(q[k]!==undefined)p[k]=clone(q[k]);}}
 const included=canonical.filter(p=>p.taxonomyAudit.disposition==='include'),observedAt=snapshots.filter(Boolean).map(s=>s.observedAt).filter(Boolean).sort().at(-1),revision=hash(Object.entries(index));
 const counts=Object.fromEntries(DEPARTMENTS.map(d=>[d.id,{label:d.label,before:canonical.filter(p=>before.get(p.sku).ids.includes(d.id)).length,after:included.filter(p=>p.departmentIds.includes(d.id)).length}]));
 const report={version:TAXONOMY_VERSION,revision,auditedAt:new Date().toISOString(),sourceObservedAt:observedAt,uniqueSkus:canonical.length,included:included.length,excluded:excluded.length,needsReview:review.length,reclassified:moved.length,descriptionVerified:canonical.filter(p=>p.taxonomyAudit.descriptionVerified).length,imageAnalysed:canonical.filter(p=>p.taxonomyAudit.imageAnalysed).length,imageAudit,counts,sourceRequestsMade:false,firecrawlCredits:0,historyAndArrivalDatesPreserved:true,comparisonBaselineCommit:baseline?.sourceCommit||null};
 await atomicJson('web/taxonomy-audit.json',{...report,reclassifiedProducts:moved,excludedProducts:excluded,reviewProducts:review});
 await atomicJson('web/taxonomy-status.json',report);
 const buckets=new Map();for(const [sku,audit]of Object.entries(index)){const k=sku.slice(-2).padStart(2,'0');if(!buckets.has(k))buckets.set(k,{});buckets.get(k)[sku]=audit;}for(const [k,v]of buckets)await atomicJson('web/taxonomy-index/'+k+'.json',v);
 if(writeViews){
  const fields=['sku','kind','department','departmentIds','lightingDepartmentIds','themeIds','variantName','name','brand','priceGBP','originalPrice','promoText','currency','sourceUrl','imageUrl','variantImageUrl','listingVariantImageUrl','cachedImageUrl','imageCacheEvidence','newStatus','newEvidence','firstObservedAt','firstNewObservedAt','arrivalEvidence','everNew','observedAt','attributeObservedAt','detailsReady','detailIssue','imageIssue','dimensions','material','colorValues','treeColor','paletteEvidence','originalImageUrl','displayImage','specificationCorrections','detailsUrl','style','heightLabel','heightCm','heightValues','skirtDiameterCm','skirtBaseDiameterCm','skirtTopDiameterCm','mailAssets','classificationEvidence','taxonomyAudit'];
  for(const dept of DEPARTMENTS.filter(d=>d.id!=='themes'&&!d.id.startsWith('theme-'))){
   const products=included.filter(p=>p.departmentIds.includes(dept.id)).map(p=>Object.fromEntries([...fields,...(!p.detailsUrl?['specifications','sourceDescription','productSummary','detailEvidence','images','originalImages']:[])].filter(k=>p[k]!==undefined||k==='sourceDescription'&&productDescription(p)).map(k=>[k,k==='sourceDescription'?productDescription(p):p[k]])));
   await atomicJson('web/classified/'+dept.id+'.json',{version:1,revision,observedAt,taxonomyVersion:TAXONOMY_VERSION,department:dept.id,sourceAudits:snapshots.filter(Boolean).flatMap((s,i)=>Object.entries(s.sources||{[sourceNames[i]]:s.source||{}}).map(([id,evidence])=>({id,...evidence}))),products,classification:{checked:canonical.length,excluded:excluded.length,needsReview:review.length,sourceRequestsMade:false,firecrawlCredits:0}});
  }
 }
 console.log(JSON.stringify({phase:'all-category-taxonomy',...report,counts:undefined,imageAudit:undefined}));
 return {report,canonical,index};
}
