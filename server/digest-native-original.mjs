import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {nativeSourceUrl} from '../web/product-facts.mjs';
import {allowedPublicImage} from '../cloud/public-image.mjs';
import {exactNativeGalleryMember} from './native-gallery-identity.mjs';

// Only the report's actual NEW products need native response bytes. A missing
// disk mirror must not force a full catalogue or gallery to be collected again.
export async function digestNativeOriginal(p,{readFile=fs.readFile,fetcher=fetch}={}) {
  const declared=p.originalImageEvidence,source=nativeSourceUrl(p)||declared?.sourceUrl,exported=p.nativeExportEvidence,validExport=exported?.sourceUrl===source&&String(exported.selectedSku)===String(p.sku)&&exported.width===declared?.width&&exported.height===declared?.height&&exported.sourceVersion===declared?.sourceVersion,prior=validExport?{...declared,sha256:exported.sha256}:declared;
  if(prior?.sha256&&p.originalCachedImageUrl&&prior.sourceUrl===source){
    let bytes;
    try{bytes=await readFile('web/'+p.originalCachedImageUrl);}catch(e){
      if(e.code!=='ENOENT'||!/^images\/(?:source|asda|du|ms|bm|hb|nx|jl|mt|ar)\/[a-f0-9]{64}\.(?:jpg|png|webp|avif|gif)$/.test(p.originalCachedImageUrl)||!p.originalCachedImageUrl.includes(prior.sha256+'.'))throw e;
      const mirror='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/main/web/'+p.originalCachedImageUrl,response=await fetcher(mirror,{signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error('Verified repository native mirror HTTP '+response.status+' for '+p.sku);
      bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>25000000)throw Error('Native original exceeds individual file guard');
    }
    if(createHash('sha256').update(bytes).digest('hex')!==prior.sha256)throw Error('Native original digest mismatch');
    if(validExport){const m=await sharp(bytes).metadata();if(m.width!==exported.width||m.height!==exported.height)throw Error('Native export dimensions changed');}
    return {bytes,source:validExport?exported.exportUrl:source,sha256:prior.sha256};
  }
  const g=p.originalImages?.find(g=>g.url===source&&exactNativeGalleryMember(p,g));
  if(!g||!allowedPublicImage(source)||p.previewReviewRequired||p.imageIssue)throw Error('Exact reviewed native gallery mapping unavailable for '+p.sku+'; '+(!g?'SKU/variant mapping':p.previewReviewRequired?'whole-product preview review':'source photo evidence'));
  const response=await fetcher(source,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Official native original HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>25000000)throw Error('Native original exceeds individual file guard');
  const m=await sharp(bytes).metadata();if(!m.width||!m.height||m.width<64||m.height<64)throw Error('Official native response lacks real photo pixels');
  const expected=prior?.sourceUrl===source?prior:null;
  if(expected?.width&&m.width!==expected.width||expected?.height&&m.height!==expected.height)throw Error('Official native response changed its declared pixel dimensions');
  return {bytes,source,sha256:createHash('sha256').update(bytes).digest('hex')};
}
