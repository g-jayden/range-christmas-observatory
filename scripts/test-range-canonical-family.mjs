import assert from 'node:assert/strict';
import {ProductDOMParser as DOMParser} from '../server/range-free-source.mjs';
import {readFamilyBundle} from '../server/firecrawl-browser.mjs';
import {parseDetails} from '../server/details.mjs';
const url='https://www.therange.co.uk/artificial-plants/old-basket',canonical='https://www.therange.co.uk/artificial-flowers/current-basket',variant={sku:'123',code:'123',id:'4',prod_id:'55',attributes:{Colour:'Yellow'},product_specification:['Height: 35cm'],features:['Exact yellow artificial hanging baskets'],description_html:'<p>Two baskets with green leaves.</p>'};
const html=target=>'<html><head><link rel="canonical" href="'+target+'"></head><body><input id="product_id" value="55"><span id="product-dyn-code">123</span><ul id="product-dyn-features-ul"><li>Artificial flower baskets</li></ul><div id="product-description">Includes the hanging chains.</div></body></html>';
const priorFetch=globalThis.fetch,priorDOM=globalThis.DOMParser;let calls=[];
try{
 globalThis.DOMParser=DOMParser;
 globalThis.fetch=async target=>{calls.push(target);if(target===url+'?json')return new Response('<html>Redirected HTML, not JSON</html>');if(target===url)return new Response(html(canonical));if(target===canonical+'?json')return Response.json({variant_arr:[variant]});throw Error('Unexpected request '+target);};
 const bundle=await readFamilyBundle({url,jsonUrl:url+'?json',anchors:[{sku:'123',variantId:'4'}]});
 assert.equal(bundle.status,200);assert.equal(bundle.evidence.redirectedSource.resolvedUrl,canonical);assert.equal(calls.length,3);
 bundle.evidence.observedAt='2026-11-24T00:00:00Z';const detail=parseDetails({success:true,data:{metadata:{statusCode:200},sourceVariant:bundle.variants[0],familyEvidence:bundle.evidence}},'123',url+'#123');assert.equal(detail.specs.Height,'35cm');assert(detail.featuresText.includes('Exact yellow artificial'));
 calls=[];globalThis.fetch=async target=>{calls.push(target);if(target===url+'?json')return new Response('Not JSON');if(target===url)return new Response(html('https://foreign.invalid/stolen'));throw Error('Canonical escape');};
 assert.notEqual((await readFamilyBundle({url,jsonUrl:url+'?json',anchors:[{sku:'123',variantId:'4'}]})).status,200);assert.equal(calls.length,2);
 calls=[];globalThis.fetch=async target=>{calls.push(target);if(target===url+'?json')return new Response('Not JSON');if(target===url)return new Response(html(canonical));return Response.json({variant_arr:[{...variant,sku:'999',code:'999'}]});};
 assert.notEqual((await readFamilyBundle({url,jsonUrl:url+'?json',anchors:[{sku:'123',variantId:'4'}]})).status,200);
 console.log('PASS: an observed same-origin canonical redirect recovers exact SKU JSON once, while another SKU or foreign canonical cannot certify product details.');
}finally{globalThis.fetch=priorFetch;if(priorDOM===undefined)delete globalThis.DOMParser;else globalThis.DOMParser=priorDOM;}
