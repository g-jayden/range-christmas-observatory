import fs from 'node:fs/promises';
import path from 'node:path';
import {descriptionFacts,applyAppearance,normaliseColors,APPEARANCE_VERSION,TREE_STYLES} from './appearance.mjs';
import {productInformation} from './details.mjs';
export async function selectGalleryImages(products){
 const selections=await fs.readFile('web/image-selections.json','utf8').then(JSON.parse).catch(()=>({}));
 for(const p of products){const pick=selections[p.sku];if(pick&&(p.variantImageUrl===pick.sourceHero||p.variantImageUrl===pick.selectedImage)&&(p.images||[]).includes(pick.selectedImage)){
  p.sourceHeroImageUrl=pick.sourceHero;p.variantImageUrl=pick.selectedImage;p.imageSelectionEvidence={...pick,sourceUrl:p.sourceUrl,method:'same-SKU-official-gallery-reviewed'};
 }}
}
export async function enrichProducts(products,{infer=true}={}){
 const cache=await fs.readFile('web/visual-cache.json','utf8').then(JSON.parse).catch(()=>({version:1,entries:{}}));
 const overrides=await fs.readFile('web/visual-overrides.json','utf8').then(JSON.parse).catch(()=>({products:{}}));let analysed=0,reviewed=0;
 for(const p of products){
  const hash=p.imageCacheEvidence?.sha256,key=p.kind+':'+hash;let visual=cache.entries[key];
  if(!p.appearanceSource)p.appearanceSource=descriptionFacts(p,p.specifications||{},'');
  if(hash&&!visual&&p.cachedImageUrl&&infer){const {analyseImage}=await import('./visual-model.mjs');visual=cache.entries[key]=await analyseImage(p,path.resolve('web',p.cachedImageUrl));analysed++;}
  visual={...(visual||{})};const manual=overrides.products[p.sku];
  if(manual?.imageHash===hash){visual={...visual,...manual};reviewed++;}
  else{
   const named=p.appearanceSource.colours||[],raw=normaliseColors(p.sourceColour||p.specifications?.Colour);
   if((visual.confidence||0)<.4&&(named.length||raw.length)){visual.colors=named.length?named:raw;visual.method='source-description-and-local-image-cross-check';}
   // Colour is the item's body. Never use Warm White/RGB lamp specifications as a tree colour.
   if(p.kind==='tree'&&/\bfibre optic|fiber optic|LED|pre[ -]?lit/i.test(p.variantName||'')&&raw.length===1&&raw[0]==='绿色'&&(!named.length||named.includes('绿色')))visual.colors=raw;
  }
  applyAppearance(p,visual);
  if(p.detailEvidence?.verifiedProductSection){const info=productInformation(p,p.specifications||{});p.productSummary=[`商品本体颜色：${p.treeColor}`,p.kind==='skirt'?`材质：${p.material}`:`主款式：${p.style}`,info.summary].join('；');p.detailEvidence.text=`分析结果\n商品本体颜色：${p.treeColor}\n${p.kind==='skirt'?'材质：'+p.material:'主款式：'+p.style}\n${p.paletteEvidence.note||''}\n\n官网原始规格（原始 Colour 可能与图片或描述冲突，统计以上方本体颜色为准）\n${info.text}${p.kind==='skirt'&&p.appearanceSource.materials?.descriptionExcerpt?'\n\n材质描述证据\n'+p.appearanceSource.materials.descriptionExcerpt:''}`;}
 }
 await fs.writeFile('web/visual-cache.json',JSON.stringify(cache));
 return {version:APPEARANCE_VERSION,model:cache.model,analysedImages:analysed,reviewedProducts:reviewed,products:products.length,firecrawlCredits:0,treeCategories:TREE_STYLES,colourCounting:'multi-label per SKU; body major colours; denominator all selected SKUs; sums may exceed 100%',materials:'specific-SKU specifications and product descriptions; no visual fibre inference',completedAt:new Date().toISOString()};
}
