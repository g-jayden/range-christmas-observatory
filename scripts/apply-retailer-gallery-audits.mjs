import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {jlAppearanceFingerprint} from '../server/jl-products.mjs';
import {atomicJson} from '../server/sync.mjs';
// An audit covers an exact URL set. A stale audit must not certify a new gallery.
for(const id of ['nx','jl']){
 const read=f=>fs.readFile('web/'+id+'/'+f,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const report=await read('gallery-audit.json'),snapshot=await read('catalogue.json');if(!report||!snapshot)continue;
 const reviews=id==='jl'?await read('reviews.json'):null;let appearanceChanged=0;if(reviews)for(const p of snapshot.products){const r=reviews[p.sku];if(p.kind==='tree'&&r?.imageHash===p.originalImageEvidence?.sha256&&r.sourceFingerprint===jlAppearanceFingerprint(p)&&['圣诞树盆栽','折叠式圣诞树','纤细圣诞树','雪景款','预亮灯款','标准款','其它树形类别'].includes(r.treeStyle)&&p.style!==r.treeStyle){p.style=r.treeStyle;p.classificationEvidence={...p.classificationEvidence,savedImageReview:r};appearanceChanged++;}}
 if(appearanceChanged)snapshot.revision=createHash('sha256').update(JSON.stringify(snapshot.products)).digest('hex');
 const urls=[...new Set(snapshot.products.filter(p=>id!=='nx'||p.sourceListed!==false).flatMap(p=>p.images||[]))].sort(),digest=createHash('sha256').update(JSON.stringify(urls)).digest('hex');
 if(report.galleryUrlsSha256!==digest||report.verified!==urls.length||report.failures?.length||report.images?.length!==urls.length||report.images.some(p=>!urls.includes(p.url)||!/^[a-f0-9]{64}$/.test(p.sha256)||!(p.width>0&&p.height>0))||new Set(report.images.map(p=>p.url)).size!==urls.length){console.log(JSON.stringify({retailerId:id,phase:'gallery-audit-no-longer-matches-current-source',sourceRequests:0,firecrawlCredits:0}));continue;}
 const imageAudit={...snapshot.imageAudit,allGalleryUrls:urls.length,allGalleryVerified:urls.length,allGalleryCheckedAt:report.checkedAt,galleryUrlsSha256:digest};snapshot.imageAudit=imageAudit;await atomicJson('web/'+id+'/catalogue.json',snapshot);const status=await read('status.json');if(status)await atomicJson('web/'+id+'/status.json',{...status,revision:snapshot.revision,imageAudit});console.log(JSON.stringify({retailerId:id,phase:'complete-gallery-audit-applied',galleryUrls:urls.length,appearanceChanged,sourceRequests:0,firecrawlCredits:0}));
}
