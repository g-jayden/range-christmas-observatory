import {createHash} from 'node:crypto';
import {bqAsset,bqImageKey} from './bq-images.mjs';
import {bqFingerprint} from './bq-products.mjs';

// A complete human review can establish that the retailer supplied no usable
// photo. This is a quarantine, never a successful product-photo verification.
export function bqPhotoQuarantine(product,index={}) {
 const conflict=product.sourceImageConflict,proof=conflict?.galleryQuarantine;
 if(!proof||proof.state!=='all-source-photos-mismatch'||!conflict.note||
   conflict.sourceFingerprint!==bqFingerprint(product)||
   conflict.imageHash!==product.previewImage?.sha256)return null;
 const gallery=[...new Set((product.originalImages||[]).map(g=>bqAsset(g.url)))];
 if(!gallery.length||proof.galleryFingerprint!==createHash('sha256').update(JSON.stringify(gallery)).digest('hex')||
   !Array.isArray(proof.images)||proof.images.length!==gallery.length||!Number.isFinite(Date.parse(proof.reviewedAt)))return null;
 const images=new Map(proof.images.map(g=>[g.asset,g.imageHash]));
 if(images.size!==gallery.length)return null;
 for(const asset of gallery){
  const hash=images.get(asset),current=index[bqImageKey(asset)];
  if(!/^[a-f0-9]{64}$/.test(hash||'')||current&&(current.error||current.sha256!==hash))return null;
 }
 if(images.get(bqAsset(product.originalImageUrl))!==conflict.imageHash)return null;
 return proof;
}
