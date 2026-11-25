import fs from'node:fs/promises';
import path from'node:path';
import{createHash}from'node:crypto';
import sharp from'sharp';
import{retailerReviewFingerprint}from'./saved-retailer-reviews.mjs';
import{localVisualClassifier}from'./local-visual-classifier.mjs';

const VERSION='asda-exact-source-tree-base-body-region-v1';
export const ASDA_BASE_COVER_LABELS=[
 'a full-size artificial Christmas tree with a floor stand',
 'a round fabric Christmas tree skirt laid underneath a Christmas tree',
 'a woven rattan or wicker Christmas tree collar around the tree stand',
 'a Christmas hanging ornament or bauble',
 'a house plant in a plant pot',
 'wooden floor and furniture without a decorative product',
 'an unrelated photo, a brand logo or a size diagram'
];
const labels=ASDA_BASE_COVER_LABELS;
const sha=b=>createHash('sha256').update(b).digest('hex');
export function asdaBaseCoverSource(p){return p?.retailerId==='asda'&&p.detailsReady===true&&p.detailEvidence?.verifiedProductSection===true&&String(p.detailEvidence.selectedSku)===String(p.sku)&&p.classificationEvidence?.offeredObjectReason==='tree-base-cover'&&p.departmentIds?.includes('asda-tree-decorations')&&/\btree (?:skirt|collar)\b|\btree stand cover\b/i.test(p.variantName||'')&&/^[a-f0-9]{64}$/.test(p.imageCacheEvidence?.sha256||'');}
export const asdaBodyReviewKey=p=>sha(JSON.stringify([VERSION,String(p.sku),p.imageCacheEvidence?.sha256,retailerReviewFingerprint(p)]));
function bodyAgreement(scores){
 if(!Array.isArray(scores)||scores.length!==labels.length||scores.some(s=>!labels.includes(s.label)||!Number.isFinite(s.score)||s.score<0||s.score>1)||new Set(scores.map(s=>s.label)).size!==labels.length)return null;
 if(Math.abs(scores.reduce((n,s)=>n+s.score,0)-1)>.01)return null;
 const ordered=[...scores].sort((a,b)=>b.score-a.score),cover=labels.slice(1,3),confidence=scores.filter(s=>cover.includes(s.label)).reduce((n,s)=>n+s.score,0);
 return cover.includes(ordered[0].label)&&ordered[0].score>=.6&&confidence>=.8&&ordered[0].score-ordered[1].score>=.3?confidence:null;
}
export function boundAsdaBodyReview(p,proof){return Boolean(asdaBaseCoverSource(p)&&proof?.version===VERSION&&proof.selectedSku===String(p.sku)&&proof.sourceFingerprint===retailerReviewFingerprint(p)&&proof.imageHash===p.imageCacheEvidence.sha256&&proof.sourceImageUnchanged===true&&proof.region?.left===0&&proof.region.top===Math.floor(proof.sourceHeight*.48)&&proof.region.width===proof.sourceWidth&&proof.region.height===proof.sourceHeight-proof.region.top&&Number.isSafeInteger(proof.sourceWidth)&&Number.isSafeInteger(proof.sourceHeight)&&proof.sourceWidth>=64&&proof.sourceHeight>=64);}
export async function analyseAsdaBaseCover(p,file,{classify}={}){
 if(!asdaBaseCoverSource(p))throw Error('Exact ASDA tree-base product source required');
 const bytes=await fs.readFile(file);if(sha(bytes)!==p.imageCacheEvidence.sha256)throw Error('ASDA offered-body source pixels changed');
 const m=await sharp(bytes).metadata();if(!m.width||!m.height)throw Error('ASDA offered-body image geometry missing');
 const top=Math.floor(m.height*.48),region={left:0,top,width:m.width,height:m.height-top},out=path.resolve('runtime/asda-offered-body/'+asdaBodyReviewKey(p)+'.png');
 await fs.mkdir(path.dirname(out),{recursive:true});
 // This is an analysis input only. Catalogue previews, source originals and
 // PDF image bytes remain the untouched full photograph.
 await sharp(bytes).extract(region).png().toFile(out);
 const model=classify||await localVisualClassifier(),scores=await model(out,labels);
 return{version:VERSION,selectedSku:String(p.sku),sourceFingerprint:retailerReviewFingerprint(p),imageHash:p.imageCacheEvidence.sha256,sourceWidth:m.width,sourceHeight:m.height,region,scores,compatible:bodyAgreement(scores)!==null,sourceImageUnchanged:true,analysedAt:new Date().toISOString(),firecrawlCredits:0};
}
export function asdaOfferedBodyVisual(p,visual,proof){
 const confidence=boundAsdaBodyReview(p,proof)&&bodyAgreement(proof.scores);if(!confidence||!visual)return visual;
 return{...visual,fullImageObjectTop:visual.objectTop,objectTop:[{id:'asda-tree-decorations',score:confidence},...(visual.objectTop||[]).filter(t=>t.id!=='asda-tree-decorations')].slice(0,3),offeredBodyReview:proof,method:'local-whole-photo-plus-exact-source-offered-tree-base-region'};
}
