import sharp from 'sharp';

export const MAX_DISPLAY_PREVIEW_BYTES=16*1024;
export const DISPLAY_PREVIEW_ENCODING='whole-frame-webp-384-max16k-v2';

// This is a display derivative only. Native originals and report inputs never
// pass through this encoder. Fit-inside preserves every edge of the product.
export async function encodeDisplayPreview(bytes){
 for(const width of [384,320,256,192,128]){
  for(const quality of width===384?[72,66,60,54,48,42,36]:[60,48,36]){
   const output=await sharp(bytes).rotate().resize({width,height:width,fit:'inside',withoutEnlargement:true}).webp({quality,effort:5}).toBuffer();
   if(output.length<=MAX_DISPLAY_PREVIEW_BYTES)return output;
  }
 }
 throw Error('Whole-frame display preview exceeds its verified byte budget');
}
