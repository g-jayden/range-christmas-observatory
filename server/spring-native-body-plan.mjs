import {exactNativeGalleryMember} from './native-gallery-identity.mjs';
import {springReviewFingerprint} from './spring-review-fingerprint.mjs';

// The immutable request names exact, already observed gallery members. This
// operation cannot discover a directory, change product facts or select a photo.
export function planSpringNativeBodies(source,request,previous={}){
 if(!source?.source?.complete||source.source.expected!==source.products?.length)throw Error('Complete exact-SKU root observation required');
 if(!/^spring-native-bodies-\d{8}-[a-z0-9-]+$/.test(request?.requestId||'')||request.baseObservedAt!==source.observedAt||!Array.isArray(request.products)||!request.products.length)throw Error('Current source-bound native-body request required');
 if(previous.requestId===request.requestId)return {reused:true,products:[],requested:previous.requested||0};
 const products=[],seen=new Set(),bySku=new Map(source.products.map(p=>[String(p.sku),p]));
 for(const row of request.products){const p=bySku.get(String(row.sku));if(!p?.detailsReady||row.factsFingerprint!==springReviewFingerprint(p)||!Array.isArray(row.urls)||!row.urls.length)throw Error('Native-body request does not match the verified selected SKU');
  for(const url of row.urls){const u=new URL(url),g=p.originalImages?.find(g=>g.url===url&&exactNativeGalleryMember(p,g)&&(g.variantId==null||String(g.variantId)===String(p.variantId)));
   if(!g||u.protocol!=='https:'||u.origin!=='https://www.therange.co.uk'||!u.pathname.startsWith('/media/')||u.username||u.password)throw Error('Native-body request contains a URL outside the exact observed gallery');
   if(!seen.has(url)){seen.add(url);products.push({...p,variantImageUrl:url,originalImageUrl:url});}
  }
 }
 return {reused:false,products,requested:products.length};
}
