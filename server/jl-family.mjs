import {plainDu} from './du-products.mjs';
export function jlFamilyEvidence(source){
 const products={},failures=[];
 for(const family of Object.values(source.families||{}))for(const v of family.variants||[]){
  const productCode=String(v.displayCode||''),specifications=Object.fromEntries([...(family.attributes||[]),...(v.attributes||[])].map(a=>[a.displayName,(a.values||[]).map(plainDu).join(' / ')])),messages=[...(family.messaging||[]),...(v.messaging||[])];
  if(!/^\d{8}$/.test(productCode)||!v.price?.display||!v.images?.primary)throw Error('John Lewis authoritative variant identity, price or gallery absent');
  const url=new URL(v.pdpURL?.url||v.canonicalURL,'https://www.johnlewis.com');if(url.origin!=='https://www.johnlewis.com'||!url.pathname.endsWith('/p'+family.pageProductId))throw Error('John Lewis variant and family URL disagree');
  const sourceColour=v.colour?.colour||'',selectedColour=/^(?:Multi|Multicolour)$/i.test(sourceColour)?sourceColour:v.colour?.trueColour||sourceColour;
  const current=Math.round(Number(v.price.value)*100),prior=v.price.reductionHistory?.[0],was=prior&&Number(prior.value)>Number(v.price.value)?Math.round(Number(prior.value)*100):null;
  const d={productCode,pageId:family.pageProductId,sourceParentIds:[family.pageProductId],name:v.title||family.title,sourceUrl:url.href,description:plainDu(family.description),observedAt:family.observedAt||source.observedAt,specifications,selectedColour,selectedSize:v.differentiators?.size||'',priceText:v.price.display,inStock:v.availability?.availableToOrder===true,stockEvidence:'John Lewis exact variant availableToOrder',sourceNew:messages.some(m=>/^new(?: in)?$/i.test(m.title||'')),structuredPrice:{current,was,badge:messages.filter(m=>m.promotionCategory==='Price'||/^save\b/i.test(m.title||'')).map(m=>m.title).join(' · ')},sourceTransport:source.transport,sourceStockId:v.aliases?.skuId,images:[v.images.primary,...(v.images.alternatives||[])].map(url=>({url:url.startsWith('//')?'https:'+url:url}))};
  const p=products[productCode];if(p){if(p.structuredPrice.current!==current||p.selectedColour!==selectedColour||p.selectedSize!==d.selectedSize)throw Error('John Lewis duplicate SKU evidence conflicts: '+productCode);p.sourceParentIds=[...new Set([...p.sourceParentIds,family.pageProductId])];}else products[productCode]=d;
 }
 return {products,failures,conflicts:[],pending:[]};
}
