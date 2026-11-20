import {applySavedRetailerReview} from '../server/saved-retailer-reviews.mjs';
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {jlAppearanceFingerprint} from '../server/jl-products.mjs';import {nextReviewMatches} from '../server/nx-image-freshness.mjs';import {NX_DEPARTMENTS} from '../web/nx-model.mjs';import {atomicJson} from '../server/sync.mjs';
// Daily Range source and targeted repair jobs must not rewrite another
// retailer while its independent collector is publishing the same catalogue.
if(process.env.COLLECTION_MODE&&process.env.COLLECTION_MODE!=='publish'){console.log(JSON.stringify({phase:'Cross-retailer publication is isolated from Range source work',sourceRequests:0,firecrawlCredits:0,foreignCataloguesWritten:0}));process.exit(0);}
const treeStyles=['圣诞树盆栽','折叠式圣诞树','纤细圣诞树','雪景款','预亮灯款','标准款','其它树形类别'];
for(const id of ['nx','jl']){
 const read=f=>fs.readFile('web/'+id+'/'+f,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const snapshot=await read('catalogue.json');if(!snapshot)continue;const reviews=await read('reviews.json');let appearanceChanged=0;
 if(reviews)for(const p of snapshot.products){const r=reviews[p.sku];if(!r)continue;const before=JSON.stringify(p);
  if(id==='jl'&&p.kind==='tree'&&r.imageHash===p.originalImageEvidence?.sha256&&r.sourceFingerprint===jlAppearanceFingerprint(p)&&treeStyles.includes(r.treeStyle)){p.style=r.treeStyle;p.classificationEvidence={...p.classificationEvidence,savedImageReview:r};}
  if(id==='nx'){
   const fp=createHash('sha256').update(JSON.stringify([p.baseName,p.sourceDescription,p.specifications])).digest('hex');
   if(nextReviewMatches(r,fp,p.originalImageEvidence?.sha256)){
    if(r.colors){p.colorValues=r.colors;p.treeColor=r.colors.join(' / ');p.paletteEvidence={...p.paletteEvidence,needsReview:false,reviewed:true,method:'saved-human-current-source-and-original-gallery-review',reviewedAt:r.reviewedAt};}
    if(r.departmentIds){p.departmentIds=r.departmentIds;p.department=r.departmentIds[0]||null;p.kind=p.department==='nx-tree'?'tree':'decoration';}
    if(r.exclude){p.department=null;p.departmentIds=[];p.taxonomyAudit={disposition:'exclude',memberships:[],reason:r.sourceConflict||r.reason};}
    if(r.sourceConflict)p.sourceConflict=r.sourceConflict;if(p.kind==='tree'&&treeStyles.includes(r.treeStyle))p.style=r.treeStyle;
    p.classificationEvidence={...p.classificationEvidence,requiresReview:false,savedImageReview:r};
   }
  }
  if(JSON.stringify(p)!==before)appearanceChanged++;
 }
 if(appearanceChanged)snapshot.revision=createHash('sha256').update(JSON.stringify(snapshot.products)).digest('hex');
 const urls=[...new Set(snapshot.products.filter(p=>id!=='nx'||p.sourceListed!==false).flatMap(p=>p.images||[]))].sort(),digest=createHash('sha256').update(JSON.stringify(urls)).digest('hex'),report=await read('gallery-audit.json');
 const matches=report&&report.galleryUrlsSha256===digest&&report.verified===urls.length&&!report.failures?.length&&report.images?.length===urls.length&&report.images.every(p=>urls.includes(p.url)&&/^[a-f0-9]{64}$/.test(p.sha256)&&p.width>0&&p.height>0)&&new Set(report.images.map(p=>p.url)).size===urls.length;
 if(matches)snapshot.imageAudit={...snapshot.imageAudit,allGalleryUrls:urls.length,allGalleryVerified:urls.length,allGalleryCheckedAt:report.checkedAt,galleryUrlsSha256:digest};
 else if(report)console.log(JSON.stringify({retailerId:id,phase:'gallery-audit-no-longer-matches-current-source',sourceRequests:0,firecrawlCredits:0}));
 // Matching human source/photo decisions are still persisted when a separate
 // gallery link is temporarily unavailable; it cannot undo their verification.
 await atomicJson('web/'+id+'/catalogue.json',snapshot);const status=await read('status.json');if(status)await atomicJson('web/'+id+'/status.json',{...status,revision:snapshot.revision,imageAudit:snapshot.imageAudit,...(id==='nx'?{categoryCounts:Object.fromEntries(NX_DEPARTMENTS.map(d=>[d.id,snapshot.products.filter(p=>p.inStock&&p.departmentIds.includes(d.id)).length])),classificationReview:snapshot.products.filter(p=>p.classificationEvidence?.requiresReview).map(p=>({sku:p.sku,name:p.variantName,department:p.department})),evidencePending:snapshot.products.filter(p=>p.inStock&&p.departmentIds.length&&(p.imageIssue||p.paletteEvidence?.needsReview||p.classificationEvidence?.requiresReview)).length}: {})});
 console.log(JSON.stringify({retailerId:id,phase:matches?'complete-gallery-audit-applied':'saved-image-reviews-applied',galleryUrls:urls.length,appearanceChanged,sourceRequests:0,firecrawlCredits:0}));
}

for(const id of ['asda','du']){const file='web/'+id+'/catalogue.json';let snapshot,reviews;try{snapshot=JSON.parse(await fs.readFile(file,'utf8'));reviews=JSON.parse(await fs.readFile('web/'+id+'/reviews.json','utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}let applied=0;for(const p of snapshot.products)if(applySavedRetailerReview(p,reviews[p.sku],id))applied++;if(applied){snapshot.revision=createHash('sha256').update(JSON.stringify(snapshot.products)).digest('hex');await atomicJson(file,snapshot);const statusFile='web/'+id+'/status.json',status=JSON.parse(await fs.readFile(statusFile,'utf8'));status.revision=snapshot.revision;status.classificationReview=snapshot.products.filter(p=>p.classificationEvidence?.requiresReview).map(p=>({sku:p.sku,name:p.variantName,department:p.department}));await atomicJson(statusFile,status);}console.log(JSON.stringify({retailerId:id,phase:'Current exact source/photo reviews applied',applied,sourceRequests:0,firecrawlCredits:0}));}
