import assert from 'node:assert/strict';
import {captureProductImageResponses} from '../server/native-image-context.mjs';
import {auditNotificationImages} from '../server/mail-assets.mjs';
const main='https://www.therange.co.uk/media/main.jpg',original='https://www.therange.co.uk/media/original.jpg',p={sku:'519319',sourceUrl:'https://www.therange.co.uk/p/cosy-nordic-mouse-decoration/p519319/#519319',variantImageUrl:main,originalImageUrl:original,detailEvidence:{selectedSku:'519319',verifiedProductSection:true}};
class Page{
 constructor(selected='519319'){this.selected=selected;this.listeners=new Set;this.bodyReads=0;}
 on(name,fn){assert.equal(name,'response');this.listeners.add(fn);}
 off(name,fn){this.listeners.delete(fn);}
 async goto(url){assert.equal(url,p.sourceUrl);for(const u of ['https://attacker.invalid/media/original.jpg',main,original])for(const fn of this.listeners)fn({url:()=>u,status:()=>200,headers:()=>({'content-type':'image/jpeg'}),body:async()=>{this.bodyReads++;return Buffer.from('native-network-bytes:'+u);}});return {status:()=>200};}
 async waitForFunction(fn,arg){if(arg===p.sku&&this.selected!==p.sku)throw Error('Selected SKU mismatch');}
 async evaluate(){}
}
const page=new Page,result=await captureProductImageResponses(page,p);assert.equal(result.images.length,2);assert.equal(result.failures.length,0);assert.equal(page.bodyReads,2,'Unrelated image responses must not be exported');assert.equal(page.listeners.size,0);assert.deepEqual(result.images[1].bytes,Buffer.from('native-network-bytes:'+original),'The actual image network bytes must remain unchanged');
const wrong=new Page('other-sku');await assert.rejects(captureProductImageResponses(wrong,p),/Selected SKU/);assert.equal(wrong.listeners.size,0);await assert.rejects(captureProductImageResponses(new Page,{...p,sourceUrl:p.sourceUrl.replace('#519319','#other')}),/exact-SKU/);
const entry=url=>({url,ok:true,hash:'a'.repeat(64),cachedImageUrl:'images/source/'+'a'.repeat(64)+'.jpg',width:1500,height:1500,observedAt:'2026-11-10T05:00:00Z'});let recovered=0;
for(const initialFailure of [false,true]){
 const product={...p},audit=await auditNotificationImages({auditImages:async()=>{if(initialFailure)throw Error('Photo batch HTTP 403');return {entries:{[main]:entry(main)},failures:[{url:original,status:403}],failed:1};},recoverOriginalImages:async products=>{recovered++;assert.equal(products.length,1);return {entries:{[main]:entry(main),[original]:entry(original)},failures:[]};}},[product],{});
 assert.equal(audit.failed,0);assert.equal(product.originalCachedImageUrl,entry(original).cachedImageUrl);assert.equal(product.originalImageEvidence.sourceUrl,original);assert.equal(product.imageCacheEvidence.sourceUrl,main);
}
assert.equal(recovered,2);console.log('Native browser response bytes, selected-SKU guards, unrelated-image exclusion, and both partial/full HTTP403 photo-batch recovery passed');
