import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const hash=x=>createHash('sha256').update(x).digest('hex');
const plain=s=>String(s||'').replaceAll('&amp;','&').trim();
export function arLegacyDetailCandidate(record,row,{now=Date.now(),maxAgeMs=7*86400000}={}){
 const sku=String(row.id),name=record?.structuredProduct?.name,at=Date.parse(record?.observedAt);
 if(!Number.isFinite(Number(row.attributes?.price))||Number(row.attributes?.price)<=0||String(record?.structuredProduct?.sku)!==sku||record.structuredProduct.offers?.priceCurrency!=='GBP'||plain(row.attributes?.name||row.attributes?.productName)!==plain(name)||!Number.isFinite(at)||at>now||now-at>=maxAgeMs)return false;
 const oldNames=[name,String(name).replaceAll('&amp;','&'),String(name).replaceAll('&','&amp;')];if(!oldNames.some(t=>hash(JSON.stringify([t,null,null,null,null]))===record.detailIdentityFingerprint))return false;
 return true;
}
export async function verifyArLegacyDetailPhoto(record,row,{fetcher=fetch,sharp,now=Date.now()}={}){
 if(!arLegacyDetailCandidate(record,row,{now}))return null;
 const sku=String(row.id),current=row.attributes?.image||row.attributes?.imageUrl||row.attributes?.imageURL,images=record.structuredProduct.image||[],prior=(Array.isArray(images)?images:[images]).map(g=>typeof g==='string'?g:g?.url).find(Boolean);let urls;
 try{urls=[new URL(current),new URL(prior)];if(urls.some(u=>u.origin!=='https://media.4rgos.it'||!new RegExp('^/[is]/Argos/'+sku+'_(?:R_SET|R_[A-Z][0-9]+[A-Z]?)(?:/|$)').test(u.pathname)))return null;}catch{return null;}
 const buffers=await Promise.all(urls.map(async u=>{u.search='';for(const[k,v]of Object.entries({w:'400',h:'400',qlt:'80',fmt:'jpg'}))u.searchParams.set(k,v);const r=await fetcher(u.href,{signal:AbortSignal.timeout(20000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw Error('Current Argos source image unavailable');const b=Buffer.from(await r.arrayBuffer());if(b.length<1000||b.length>5000000)throw Error('Unexpected source identity preview');return b;}));
 sharp??=(await import('sharp')).default;const pixels=await Promise.all(buffers.map(b=>sharp(b).raw().toBuffer({resolveWithObject:true})));
 if(pixels[0].info.width!==pixels[1].info.width||pixels[0].info.height!==pixels[1].info.height||pixels[0].info.channels!==pixels[1].info.channels||!pixels[0].data.equals(pixels[1].data))return null;
 return {method:'current-exact-SKU-title-and-official-preview-pixel-equality',currentImage:current,priorImage:prior,pixelSha256:hash(pixels[0].data),width:pixels[0].info.width,height:pixels[0].info.height,verifiedAt:new Date(now).toISOString(),originalDetailObservedAt:record.observedAt,detailDateNotAdvanced:true,firecrawlCredits:0};
}
export function decodeArLegacySeeds(envelope){
 if(envelope?.encoding!=='gzip-base64-json-v1'||typeof envelope.payloadBase64!=='string'||envelope.payloadBase64.length>24000000)throw Error('Invalid Argos saved detail envelope');const b=Buffer.from(envelope.payloadBase64,'base64');if(hash(b)!==envelope.compressedSha256)throw Error('Saved Argos detail payload changed');const d=JSON.parse(gunzipSync(b,{maxOutputLength:16000000}));if(!Array.isArray(d.products))throw Error('Saved Argos exact product records missing');return d.products;
}
