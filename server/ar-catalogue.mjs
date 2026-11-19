import fs from 'node:fs/promises';import {createHash}from'node:crypto';import{AR_DEPARTMENTS}from'../web/ar-model.mjs';
export async function writeArCatalogue(snapshot,{root='web/ar',accept=false}={}){
 if(!snapshot.collectionComplete||snapshot.pendingDetails?.length||snapshot.products.length!==snapshot.sourceProductIds)throw Error('Complete current Argos source required');
 const scoped=snapshot.products.filter(p=>p.department),bad=scoped.filter(p=>!p.previewImage||!p.originalCachedImageUrl||p.nativeImageIssue||p.classificationEvidence?.requiresReview||p.previewReviewRequired);
 if(accept&&bad.length)throw Error('Argos exact original/photo/physical review remains pending for '+bad.length+' products');
 await fs.mkdir(root+'/details',{recursive:true});const buckets=new Map(),products=[];
 for(const p of snapshot.products){const bucket=createHash('sha256').update(p.sku).digest('hex').slice(0,2),file='ar/details/'+bucket+'.json';if(!buckets.has(bucket))buckets.set(bucket,{});buckets.get(bucket)[p.sku]=p;const{sourceDescription,productSummary,originalImages,images,visualEvidence,specifications,...card}=p;products.push({...card,detailsUrl:file,originalImages:originalImages.slice(0,0)});}
 for(const[bucket,data]of buckets)await fs.writeFile(root+'/details/'+bucket+'.json',JSON.stringify(data));
 const catalogue={...snapshot,products,automaticArrivalChecks:snapshot.automaticArrivalChecks===true,photoAcceptance:{accepted:bad.length===0,pending:bad.map(p=>p.sku)},revision:createHash('sha256').update(JSON.stringify(products)).digest('hex')};await fs.writeFile(root+'/catalogue.json',JSON.stringify(catalogue));
 const status={retailerId:'ar',state:accept?'active':'verifying',observedAt:snapshot.observedAt,revision:catalogue.revision,uniqueSourceSkus:snapshot.sourceProductIds,displayRecords:scoped.length,details:snapshot.products.length,sourceCounts:snapshot.sourceCounts,sourceAudits:snapshot.sourceAudits,imageAudit:snapshot.imageAudit,classificationPending:bad.length,sourceRequests:0,firecrawlCredits:0};await fs.writeFile(root+'/status.json',JSON.stringify(status));return status;
}
