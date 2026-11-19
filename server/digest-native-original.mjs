import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {allowedPublicImage} from '../cloud/public-image.mjs';

// Only the report's actual NEW products need native response bytes. A missing
// disk mirror must not force a full catalogue or gallery to be collected again.
export async function digestNativeOriginal(p,{readFile=fs.readFile,fetcher=fetch}={}) {
  const prior=p.originalImageEvidence,source=p.originalImageUrl||prior?.sourceUrl;
  if(prior?.sha256&&p.originalCachedImageUrl&&prior.sourceUrl===source){
    const bytes=await readFile('web/'+p.originalCachedImageUrl);
    if(createHash('sha256').update(bytes).digest('hex')!==prior.sha256)throw Error('Native original digest mismatch');
    return {bytes,source,sha256:prior.sha256};
  }
  const g=p.originalImages?.find(g=>g.url===source&&String(g.selectedSku)===String(p.sku));
  if(!g||!allowedPublicImage(source)||p.previewReviewRequired||p.imageIssue)throw Error('Exact reviewed native gallery mapping unavailable');
  const response=await fetcher(source,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Official native original HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>25000000)throw Error('Native original exceeds individual file guard');
  const m=await sharp(bytes).metadata();if(!m.width||!m.height||m.width<64||m.height<64)throw Error('Official native response lacks real photo pixels');
  const expected=prior?.sourceUrl===source?prior:null;
  if(expected?.width&&m.width!==expected.width||expected?.height&&m.height!==expected.height)throw Error('Official native response changed its declared pixel dimensions');
  return {bytes,source,sha256:createHash('sha256').update(bytes).digest('hex')};
}
