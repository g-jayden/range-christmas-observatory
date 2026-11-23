import{fileURLToPath}from'node:url';import{readSpring}from'./update-spring.mjs';import{springSourceDecision}from'../web/spring-model.mjs';
import{loadPolicy,detailFingerprint}from'./collection-policy.mjs';import{openCreditBudget}from'./credit-budget.mjs';import{createFirecrawlBrowserReader}from'./firecrawl-browser.mjs';
import{parseDetails,applyDetails}from'./details.mjs';import{materialFacts,normaliseColors}from'./appearance.mjs';import{productDimensions}from'../web/catalogue-model.mjs';import{atomicJson}from'./sync.mjs';
export function springSourceAlternates(p){
 const root=new URL(p.sourceUrl);if(root.origin!=='https://www.therange.co.uk')throw Error('Official source origin required');let leaf=root.pathname.split('/').filter(Boolean).at(-1)||'';try{leaf=decodeURIComponent(leaf);}catch{}const code=String(p.productCode||'').toLowerCase(),urls=[];
 const add=raw=>{const u=new URL(raw);u.hash=p.sku;if(u.origin!=='https://www.therange.co.uk')throw Error('Official source origin required');if(u.href!==root.href&&!urls.includes(u.href))urls.push(u.href);};
 // The retailer itself publishes /p/<slug>/<productCode> addresses. The
 // listing's family product code is the identifier, not a guessed SKU alias.
 if(/^[mp]\d{1,12}$/.test(code)){const slug=leaf.replace(/[\u0000-\u001f\u00a0\u00bf]/g,'-').replace(/-+/g,'-');add('https://www.therange.co.uk/p/'+encodeURIComponent(slug)+'/'+code);}
 if(/[\u0000-\u001f]/.test(p.sourceUrl)||/%13/i.test(p.sourceUrl)){const u=new URL(p.sourceUrl.replace(/[\u0000-\u001f]/g,'\u00bf').replace(/%13/ig,'%C2%BF'));add(u.href);}
 if(root.pathname.startsWith('/home-furnishings/')){const u=new URL(root);u.pathname=u.pathname.replace('/home-furnishings/','/home-furnishings-and-decor/');add(u.href);}
 if(p.detailIssue?.status===0&&!urls.includes(root.href))urls.push(root.href);
 return urls;
}
export async function repairSpringSource(){
 const snapshot=await readSpring();if(!snapshot.source?.complete)throw Error('Complete saved spring directory required');const selected=snapshot.products.filter(p=>!p.detailsReady&&springSourceDecision(p).disposition!=='exclude');
 const policy={...await loadPolicy(),maxRunSeconds:3600,familyBatchConcurrency:8,familyFetchTimeoutMs:20000};let reader,budget;const successes=[],failures=[];
 try{budget=await openCreditBudget(policy);reader=await createFirecrawlBrowserReader({policy,budget});const candidates=new Map(selected.map(p=>[p.sku,springSourceAlternates(p)]));
  for(let rank=0;rank<3;rank++){const batch=selected.filter(p=>!p.detailsReady&&candidates.get(p.sku)[rank]).map(p=>({...p,sourceUrl:candidates.get(p.sku)[rank]}));if(!batch.length)continue;try{await reader.prepareFamilies(batch);}catch(e){console.error(JSON.stringify({phase:'spring-targeted-address-batch',rank,error:e.message}));}
   for(const candidate of batch){const p=selected.find(p=>p.sku===candidate.sku);try{const d=parseDetails(await reader.raw(candidate.sourceUrl,{formats:['rawHtml','markdown']}),p.sku,candidate.sourceUrl);if(d.exactVariantSource?.variantId!==String(p.variantId)||d.exactVariantSource?.selectedSku!==p.sku)throw Error('Alternate address returned another SKU or variant');
    const old=p.sourceUrl;p.sourceUrl=candidate.sourceUrl;applyDetails(p,d);p.sourceDescription=d.featuresText;p.dimensions=productDimensions(d.specs,d.featuresText);p.material=materialFacts(d.specs,d.featuresText).label;p.colorValues=normaliseColors(d.specs.Colour||d.specs.Color||'');p.treeColor=p.colorValues.join(' / ');p.detailInputFingerprint=detailFingerprint(p);p.sourceAddressRepair={rawSourceUrl:p.sourceAddressRepair?.rawSourceUrl||old,sourceUrl:p.sourceUrl,method:'official-family-product-code-and-exact-SKU-variant-verified',productCode:p.productCode,variantId:p.variantId,verifiedSku:p.sku,observedAt:d.observedAt};delete p.detailIssue;successes.push({sku:p.sku,sourceUrl:p.sourceUrl});
   }catch(e){failures.push({sku:p.sku,sourceUrl:candidate.sourceUrl,status:e.status||0,error:e.message,rank});}}
   await atomicJson('web/spring/source.json',snapshot);console.log(JSON.stringify({phase:'spring-address-repair',rank,recovered:successes.length,remaining:selected.filter(p=>!p.detailsReady).length}));
  }
  await reader.close();const native=reader.metrics();await budget.settle({credits:native.firecrawlCredits,receipt:native.receipt,report:{mode:'range-spring-targeted-address-repair',native}});snapshot.sourceAddressAudit={at:new Date().toISOString(),selected:selected.length,recovered:successes.length,successes,failures,native};await atomicJson('web/spring/source.json',snapshot);console.log(JSON.stringify({phase:'spring-address-repair-complete',selected:selected.length,recovered:successes.length,remaining:selected.filter(p=>!p.detailsReady).length,firecrawlCredits:native.firecrawlCredits}));
 }catch(e){await reader?.close().catch(()=>{});const n=reader?.metrics()||{};await budget?.settle({credits:n.firecrawlCredits||0,receipt:n.receipt,report:{mode:'range-spring-targeted-address-repair',error:e.message,native:n}});await atomicJson('web/spring/source.json',snapshot);throw e;}finally{await reader?.close();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1])))await repairSpringSource();
