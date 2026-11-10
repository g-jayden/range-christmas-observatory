import {retailerAssetId,independentRetailer} from '../web/retailers.mjs';
import {mailAssetUrl,pinMailAssets,publishedManifestUrl} from './published-mail-assets.mjs';

// Files are published and checked before recording a NEW event. Transporting
// their base64 representation through Durable Object storage is unnecessary
// and used to reject valid, lossless product cards larger than 5 MB.
export const NOTIFICATION_CONTRACT='published-assets-v1';
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=message=>Object.assign(Error(message),{status:422});
export async function verifyPublishedNotification(p,{fetcher=fetch,now=Date.now()}={}){
 const m=p?.mailAssets,sku=String(p?.sku||''),id=retailerAssetId(p);
 if(!/^\d{1,12}$/.test(sku)||!m?.publishedRevision||m.sku!==sku||m.sourceUrl!==p.sourceUrl||m.priceGBP!==p.priceGBP||String(p.detailEvidence?.selectedSku)!==sku||p.detailEvidence?.verifiedProductSection!==true||!Number.isFinite(Date.parse(p.attributeObservedAt))||Date.parse(p.attributeObservedAt)>now)throw fail('已发布新品的SKU、详情或价格证据不一致');
 if(m.evidenceMode!=='verified-information-card'&&!m.proof?.url)throw fail('已发布新品缺少已核验的信息卡或真实页面证据');
 const mapped=p.originalImages?.some(g=>g.url===m.original?.sourceUrl&&(independentRetailer(p)?String(g.selectedSku)===sku:g.variantId!=null&&p.variantId!=null&&String(g.variantId)===String(p.variantId)||p.originalSourceEvidence?.selectedSku===sku&&p.originalSourceEvidence?.sourceUrl===p.sourceUrl));
 if(!mapped||p.originalImageEvidence?.sourceUrl!==m.original?.sourceUrl||p.originalImageEvidence?.sha256!==m.original?.sha256)throw fail('官网原图与具体SKU图库或原图校验记录不一致');
 const manifestUrl=publishedManifestUrl(p),r=await fetcher(manifestUrl,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Object.assign(Error('已保存的新品文件清单暂时无法读取'),{status:503,assetStatus:r.status});
 let source;try{source=await r.json()}catch{throw fail('新品文件清单格式错误');}
 const published=pinMailAssets(source,m.publishedRevision);
 if(published.sku!==sku||published.sourceUrl!==p.sourceUrl||published.priceGBP!==p.priceGBP||published.evidenceMode!==m.evidenceMode||published.card?.sha256!==m.card?.sha256||published.original?.sha256!==m.original?.sha256)throw fail('已提交新品与固定版本中的文件清单不一致');
 for(const key of ['card','original',...(published.mailOriginal?['mailOriginal']:[]),...(published.proof?['proof']:[])]){
  const asset=published[key];if(!/^[a-f0-9]{64}$/.test(asset?.sha256||'')&&key!=='proof')throw fail('新品附件缺少文件校验值');
  const url=mailAssetUrl(asset.url,id),response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(25000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Object.assign(Error('新品附件暂时无法读取'),{status:503,assetStatus:response.status});
  const bytes=await response.arrayBuffer();if(bytes.byteLength<1||bytes.byteLength>32000000)throw fail('新品附件大小异常');
  if(asset.bytes&&bytes.byteLength!==asset.bytes||asset.sha256&&await digest(bytes)!==asset.sha256)throw fail('新品附件的真实字节与文件清单不一致');
 }
 return {manifest:published,verifiedAt:new Date(now).toISOString(),contract:NOTIFICATION_CONTRACT};
}
