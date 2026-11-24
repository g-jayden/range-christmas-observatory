import assert from 'node:assert/strict';
import {ProductDOMParser} from '../server/range-free-source.mjs';
import {readFamilyBundle} from '../server/firecrawl-browser.mjs';
import {parseDetails} from '../server/details.mjs';
import {readRangeImageGalleries,acceptedImageGallery} from '../server/range-image-gallery.mjs';

// Reproduces the live 2026-11-24 SKU 1438837 page: the visible gallery
// contains a close-up; its exact single-SKU Product JSON also lists a whole
// tree view. Neither URL is presumed high resolution before byte inspection.
const url='https://www.therange.co.uk/home-furnishings-and-decor/vases-and-artificial-plants/artificial-plants/180cm-artificial-bamboo-tree-with-natural-bamboo-canes';
const whole='https://www.therange.co.uk/media/8/0/1785773128_7493.jpg',close='https://www.therange.co.uk/media/5/2/1785771676_8191.jpg',thumb='https://www.therange.co.uk/media/0/2/1785771676_9844.jpg';
const v={sku:'1438837',code:'1438837',id:'10232154',prod_id:'3599979',attributes:{Height:'180cm'},product_specification:[],features:[]};
let variants=[v],structuredSku=v.sku,extra=whole;
const html=()=>'<html><head><script type="application/ld+json">'+JSON.stringify({'@type':'Product',sku:structuredSku,offers:{sku:structuredSku},image:{url:[extra,thumb]}})+'</script></head><body><input id="product_id" value="3599979"><ul id="available-imgs"><li><a class="rsImg" href="'+close+'"><img src="'+thumb+'" data-variant="10232154"></a></li></ul></body></html>';
const oldFetch=globalThis.fetch,oldDOM=globalThis.DOMParser;
try{
 globalThis.DOMParser=ProductDOMParser;
 globalThis.fetch=async target=>String(target).endsWith('?json')?Response.json({variant_arr:variants}):new Response(html());
 const parse=async()=>{const b=await readFamilyBundle({url,jsonUrl:url+'?json',anchors:[{sku:v.sku,variantId:v.id}]});assert.equal(b.status,200);return parseDetails({success:true,data:{metadata:{statusCode:200},sourceVariant:b.variants[0],familyEvidence:b.evidence}},v.sku,url+'/#'+v.sku);};
 const d=await parse();assert.deepEqual(d.originalImages.map(g=>g.url),[close,whole]);assert.equal(d.specs.Height,'180cm');assert(d.originalImages.every(g=>g.selectedSku===v.sku&&g.variantId===v.id));
 const p={sku:v.sku,variantId:v.id,sourceUrl:url+'/#'+v.sku,variantImageUrl:whole};
 const gallery=(await readRangeImageGalleries({products:[p],maxAttempts:1}))[0];assert(acceptedImageGallery(p,gallery));assert.deepEqual(gallery.images.map(g=>g.url),[close,whole]);
 extra=close;assert.deepEqual((await parse()).originalImages.map(g=>g.url),[close],'Duplicate structured URLs and visible thumbnails are not extra originals');
 extra='https://foreign.invalid/media/unrelated.jpg';assert.deepEqual((await parse()).originalImages.map(g=>g.url),[close]);
 extra=whole;variants=[v,{...v,sku:'foreign',code:'foreign',id:'other'}];assert.deepEqual((await parse()).originalImages.map(g=>g.url),[close],'A multi-SKU family cannot donate an untagged Product image to every variant');
 assert.deepEqual((await readRangeImageGalleries({products:[p],maxAttempts:1}))[0].images.map(g=>g.url),[close]);
 variants=[v];structuredSku='foreign';assert.deepEqual((await parse()).originalImages.map(g=>g.url),[close]);
 console.log('PASS: exact sole-SKU structured images supplement an existing visible gallery; duplicate thumbnails, other SKUs and foreign origins are rejected without altering product facts or claiming unmeasured resolution.');
}finally{globalThis.fetch=oldFetch;if(oldDOM===undefined)delete globalThis.DOMParser;else globalThis.DOMParser=oldDOM;}
