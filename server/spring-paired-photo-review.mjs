import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {materializeCommittedImage} from './committed-image-file.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
// This compares actual decoded pixels, not image names or an embedding. It
// never generates, enlarges, replaces or recompresses the saved source bytes.
export async function compareSpringPhotoPair(thumbnail,original){
 const [a,b]=await Promise.all([sharp(thumbnail).metadata(),sharp(original).metadata()]);
 if(!a.width||!a.height||!b.width||!b.height||Math.abs(a.width/a.height-b.width/b.height)>.005||Math.max(b.width,b.height)<1000||Math.max(b.width,b.height)<Math.max(a.width,a.height)*1.5)return{equivalent:false,reason:'not-a-matching-larger-native-frame'};
 // Match the source thumbnail's sampling resolution before the common
 // comparison grid. Two different resampling paths can otherwise create
 // edge differences even for a genuinely paired JPEG.
 const sampledOriginal=await sharp(original).rotate().resize(a.width,a.height,{fit:'fill'}).png().toBuffer();
 const pixels=async data=>sharp(data).rotate().flatten({background:'white'}).resize(128,128,{fit:'fill'}).removeAlpha().raw().toBuffer(),[x,y]=await Promise.all([pixels(thumbnail),pixels(sampledOriginal)]);if(x.length!==y.length)return{equivalent:false,reason:'decoded-pixel-shape-differs'};
 let square=0,absolute=0,outliers=0,foregroundSquare=0,foregroundChannels=0;const blocks=new Array(256).fill(0);
 for(let i=0;i<x.length;i+=3){const foreground=Math.min(...x.subarray(i,i+3),...y.subarray(i,i+3))<235,px=i/3,block=Math.floor(Math.floor(px/128)/8)*16+Math.floor((px%128)/8);for(let c=0;c<3;c++){const d=Math.abs(x[i+c]-y[i+c]);square+=d*d;absolute+=d;blocks[block]+=d*d;if(d>16)outliers++;if(foreground){foregroundSquare+=d*d;foregroundChannels++;}}}
 const rms=Math.sqrt(square/x.length),meanAbsolute=absolute/x.length,outlierRatio=outliers/x.length;
 const foregroundRms=foregroundChannels?Math.sqrt(foregroundSquare/foregroundChannels):Infinity,maxBlockRms=Math.sqrt(Math.max(...blocks)/(8*8*3));
 return{equivalent:rms<=4&&meanAbsolute<=2&&outlierRatio<=.01&&foregroundChannels>=384&&foregroundRms<=6&&maxBlockRms<=10,rms,meanAbsolute,outlierRatio,foregroundRms,maxBlockRms,thumbnailWidth:a.width,thumbnailHeight:a.height,originalWidth:b.width,originalHeight:b.height,method:'exact-official-thumbnail-anchor-and-decoded-rgb-pixel-comparison-v1'};
}
export async function pairedSpringPhotoReviews(products,reviews,entries){
 const effective={...reviews,products:{...reviews.products}},proofs=[];
 for(const p of products){
  const r=reviews.products?.[p.sku],e=p.originalImageEvidence;
  if(r?.disposition!=='include'||r.wholeProductFrame!==true||!r.reason||!r.reviewArtifact||!e?.sha256||r.imageHash===e.sha256||!p.detailsReady||!p.detailEvidence?.verifiedProductSection||String(p.detailEvidence.selectedSku)!==String(p.sku)||r.sourceContentHash!==p.detailEvidence.sourceContentHash)continue;
  const g=p.originalImages?.find(g=>g.url===e.sourceUrl&&g.thumbnail&&exactNativeGalleryMember(p,g)&&String(g.variantId)===String(p.variantId)&&(!r.selectedNativeSourceUrl||g.thumbnail===r.selectedNativeSourceUrl)),old=g&&entries?.[g.thumbnail],next=entries?.[e.sourceUrl];
  if(old?.ok!==true||next?.ok!==true||old.hash!==r.imageHash||next.hash!==e.sha256||!/^images\/source\/[a-f0-9]{64}\.[a-z0-9]+$/.test(old.cachedImageUrl||'')||!/^images\/source\/[a-f0-9]{64}\.[a-z0-9]+$/.test(p.originalCachedImageUrl||''))continue;
  try{
   await Promise.all([materializeCommittedImage(old.cachedImageUrl,old.hash),materializeCommittedImage(p.originalCachedImageUrl,e.sha256)]);
   const [thumbnail,original]=await Promise.all([fs.readFile('web/'+old.cachedImageUrl),fs.readFile('web/'+p.originalCachedImageUrl)]);if(digest(thumbnail)!==old.hash||digest(original)!==e.sha256)continue;
   const comparison=await compareSpringPhotoPair(thumbnail,original);if(!comparison.equivalent)continue;
   const proof={...comparison,sku:String(p.sku),variantId:String(p.variantId),thumbnailUrl:g.thumbnail,reviewedThumbnailHash:r.imageHash,originalUrl:e.sourceUrl,originalHash:e.sha256,sourceContentHash:r.sourceContentHash,humanReviewArtifact:r.reviewArtifact,verifiedAt:new Date().toISOString()};
   effective.products[p.sku]={...r,imageHash:e.sha256,selectedNativeSourceUrl:e.sourceUrl,nativeEquivalence:proof};proofs.push(proof);
  }catch{}
 }
 return{reviews:effective,audit:{applied:proofs.length,proofs,sourceRequests:0,firecrawlCredits:0}};
}
