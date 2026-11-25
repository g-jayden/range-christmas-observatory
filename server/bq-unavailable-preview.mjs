import {createHash} from 'node:crypto';
import {bqFingerprint} from './bq-products.mjs';
import {bqImageKey} from './bq-images.mjs';
import {foreignBqPhotoEvidence} from '../web/bq-foreign-photo-model.mjs';

const method='complete-current-gallery-known-unrelated-photos-v1';
const galleryHash=images=>createHash('sha256').update(JSON.stringify(images)).digest('hex');

// A negative result is reusable only for the same closed source observation,
// complete gallery, and successfully version-checked image bytes. It is never
// a product approval, and never suppresses a changed image or tomorrow's scan.
export function unavailableBqPreview(p,images,index,visual){
 const observed=Date.parse(p.observedAt);
 if(!Number.isFinite(observed)||!images.length||new Set(images).size!==images.length)return null;
 const frames=[];
 for(const asset of images){
  const key=bqImageKey(asset),r=index[key],v=visual[key];
  if(!r?.sha256||r.error||r.sourceVersion==null||v?.imageHash!==r.sha256||!Number.isFinite(Date.parse(r.checkedAt))||Date.parse(r.checkedAt)<observed||!foreignBqPhotoEvidence(p,r.sha256))return null;
  frames.push({asset,imageHash:r.sha256,sourceVersion:String(r.sourceVersion)});
 }
 return {method,sku:p.sku,sourceFingerprint:bqFingerprint(p),sourceObservedAt:p.observedAt,productName:p.variantName||p.baseName||'',physicalType:p.department,galleryFingerprint:galleryHash(images),frames,unavailable:true};
}

export function reusableUnavailableBqPreview(p,images,prior,index,visual){
 if(prior?.method!==method||prior.unavailable!==true)return false;
 const current=unavailableBqPreview(p,images,index,visual);
 return Boolean(current&&JSON.stringify(prior)===JSON.stringify(current));
}
