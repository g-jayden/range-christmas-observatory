import{rangeNativeTargets}from'./range-native-plan.mjs';

// A verified main photograph does not imply that every detail frame is saved.
// Count only exact-SKU, non-rejected gallery members, using the same plan as
// native recovery. This is per-frame binding coverage, not a new source read.
export function publishedGalleryCoverage(products){
 const targets=rangeNativeTargets(products,{includeGallery:true}),mainPaths=new Map(),missing=[],limited=[];let mirrored=0;
 for(const p of products){const e=p.originalImageEvidence;if(e?.sourceUrl&&e.sha256&&p.originalCachedImageUrl&&(!e.selectedSku||String(e.selectedSku)===String(p.sku)))mainPaths.set(e.sourceUrl+'|'+e.sha256,p.originalCachedImageUrl);}
 for(const[url,p]of targets){const g=p.originalImages[0],e=p.originalImageEvidence,hash=e?.sha256,raw=p.originalCachedImageUrl||g.nativeCachePath||mainPaths.get(url+'|'+hash)||'',path=raw.replace(/^https:\/\/raw\.githubusercontent\.com\/g-jayden\/range-christmas-observatory\/(?:main|[a-f0-9]{40})\/web\//,'');
  if(!/^[a-f0-9]{64}$/.test(hash||'')||!new RegExp('^images/source/'+hash+'\\.(?:jpg|png|webp|avif|gif)$').test(path)||!(e.width>=64&&e.height>=64)){missing.push({sku:String(p.sku),url});continue;}
  mirrored++;if(Math.max(e.width,e.height)<=300)limited.push({sku:String(p.sku),url,width:e.width,height:e.height});
 }
 return{method:'published-exact-SKU-per-frame-native-bindings',uniqueExactGalleryFrames:targets.size,framesWithNativeMirror:mirrored,framesAwaitingNativeMirror:missing.length,productsWithPendingFrames:new Set(missing.map(p=>p.sku)).size,nativeFramesAtMost300px:limited.length,complete:missing.length===0,sourceRequests:0,firecrawlCredits:0};
}
