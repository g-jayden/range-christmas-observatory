// Read only the JSON-shaped public business state. Never evaluate page scripts.
export function parseArStateLiteral(raw){
 let out='',quoted=false,escaped=false;
 raw=String(raw).trim().replace(/;\s*$/,'');
 for(let i=0;i<raw.length;){const ch=raw[i];if(quoted){out+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;i++;continue;}if(ch==='"'){quoted=true;out+=ch;i++;continue;}if(raw.startsWith('undefined',i)&&(!i||!/[\w$]/.test(raw[i-1]))&&(i+9===raw.length||!/[\w$]/.test(raw[i+9]))){out+='null';i+=9;continue;}out+=ch;i++;}
 return JSON.parse(out);
}
export function arPublicState(html){
 const match=String(html).match(/<script\b[^>]*>\s*window\.__data\s*=([\s\S]*?)<\/script>/i);
 if(!match)throw Error('Argos public product state absent');return parseArStateLiteral(match[1]);
}

// App-router lists carry the same business props inside JSON-encoded Flight
// records. Decode their literal payloads, without evaluating a Flight script.
export function arDirectoryPageProps(html){
 const visible=props=>{
  const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&pound;/g,'£').replace(/&nbsp;/g,' '),attr=(tag,key)=>decode(tag.match(new RegExp('\\b'+key+'=["\\\']([^"\\\']*)["\\\']','i'))?.[1]),tags=[...String(html).matchAll(/<div\b[^>]*\bdata-testid=["']component-product-card["'][^>]*>/gi)],byId=new Map();
  for(let n=0;n<tags.length;n++){
   const tag=tags[n],id=attr(tag[0],'data-product-id');if(!id||byId.has(id))continue;
   const card=String(html).slice(tag.index,tags[n+1]?.index??String(html).length),links=[...card.matchAll(/<a\b[^>]*>/gi)],title=links.find(m=>{if(!attr(m[0],'title'))return false;try{const u=new URL(attr(m[0],'href'),'https://www.argos.co.uk/');return u.origin==='https://www.argos.co.uk'&&u.pathname.replace(/\/$/,'')==='/product/'+id;}catch{return false;}}),price=card.match(/<span\b[^>]*\bclass=["'][^"']*\bds-c-price__price\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),amount=decode(price?.[1].replace(/<[^>]*>/g,'')).match(/^\s*£\s*([\d,]+(?:\.\d{2})?)\s*$/),image=card.match(/<img\b[^>]*>/i);
   if(!title)continue;const facts={name:attr(title[0],'title'),image:attr(image?.[0]||'','src'),visibleCardSource:true};if(amount)facts.price=Number(amount[1].replaceAll(',',''));byId.set(id,facts);
  }
  return {...props,productData:props.productData.map(row=>{const card=byId.get(String(row.id));return card?{...row,attributes:{...row.attributes,...card}}:row;})};
 };
 const sai=String(html).match(/<script\b[^>]*\bid=["']sai-product-data["'][^>]*>([\s\S]*?)<\/script>/i);let native;
 if(sai){const d=JSON.parse(sai[1]);if(d.version!=='1.0'||!Number.isInteger(d.currentPage)||d.currentPage<1||!Number.isInteger(d.totalPages)||d.totalPages<d.currentPage||!Number.isInteger(d.totalNumberOfAllProducts)||d.totalNumberOfAllProducts<0||!Array.isArray(d.products)||d.products.length!==d.rank1CountForCurrentPage||d.products.length>d.totalNumberOfAllProducts||new Set(d.products.map(p=>String(p.id))).size!==d.products.length||d.products.some(p=>!/^[a-z0-9]{7,8}$/.test(String(p.id))||typeof p.title!=='string'))throw Error('Argos native listing counters or exact identities are inconsistent');native={productMetadata:{currentPage:d.currentPage,totalPages:d.totalPages,numberOfResults:d.totalNumberOfAllProducts},productData:d.products.map(p=>({id:String(p.id),attributes:{name:p.title},sourceTransport:'official-sai-product-data'})),sourceTransport:'official-sai-product-data'};}
 const direct=String(html).match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
 if(direct)return visible(JSON.parse(direct[1]).props.pageProps);
 const matches=[];const visit=v=>{if(Array.isArray(v))for(const x of v)visit(x);else if(v&&typeof v==='object'){if(v.pageProps?.productData&&v.pageProps.productMetadata)matches.push(v.pageProps);for(const x of Object.values(v))visit(x);}};
 for(const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const payload=m[1].trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);if(!payload)continue;
  let outer;try{outer=JSON.parse(payload[1]);}catch{continue;}
  if(outer[0]!==1||typeof outer[1]!=='string')continue;
  for(const line of outer[1].split('\n')){if(!/^[a-f0-9]+:/.test(line))continue;try{visit(JSON.parse(line.slice(line.indexOf(':')+1)));}catch{}}
 }
 if(native){const full=matches.find(p=>p.productMetadata.currentPage===native.productMetadata.currentPage&&p.productMetadata.numberOfResults===native.productMetadata.numberOfResults&&p.productData.length>=native.productData.length&&native.productData.every(n=>p.productData.some(r=>String(r.id)===n.id)));return visible(full||native);}
 if(matches.length!==1)throw Error('Argos listing business props absent or ambiguous');return visible(matches[0]);
}

export function arStructuredProduct(html,expectedSku){
 const products=[];for(const m of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const v=JSON.parse(m[1]);for(const p of v['@graph']||[v])if(p['@type']==='Product')products.push(p);}catch{}}
 const selected=products.filter(p=>String(p.sku)===String(expectedSku));if(selected.length!==1)throw Error('Exact Argos public Product identity is absent or ambiguous');
 const p=selected[0],u=new URL(p.url);if(u.origin!=='https://www.argos.co.uk'||u.pathname!=='/product/'+expectedSku)throw Error('Argos public Product URL identity conflict');return p;
}

export function arProductFlightFacts(html,sku){
 const facts={availability:null,pricing:null};
 const clean=x=>typeof x==='string'&&x==='$undefined'?null:x;
 const visit=v=>{if(Array.isArray(v)){for(const x of v)visit(x);return;}if(!v||typeof v!=='object')return;
  if(String(v.sku)===sku&&v.attributes&&typeof v.attributes.globallyOutOfStock==='boolean')facts.availability=v.attributes;
  if(String(v.product?.partNumber)===sku&&v.product.price&&Number.isFinite(v.product.price.now))facts.pricing=Object.fromEntries(Object.entries(v.product.price).map(([k,x])=>[k,clean(x)]));
  if(String(v.currentProduct?.sku)===sku&&Number.isFinite(v.currentProduct.price))facts.pricing={...(facts.pricing||{}),now:v.currentProduct.price,was:clean(v.currentProduct.wasPrice),flashText:v.currentProduct.flashText||''};
  for(const x of Object.values(v))visit(x);
 };
 for(const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const match=m[1].trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);if(!match)continue;
  let outer;try{outer=JSON.parse(match[1]);}catch{continue;}if(outer[0]!==1||typeof outer[1]!=='string')continue;
  for(const line of outer[1].split('\n')){if(!/^[a-f0-9]+:/.test(line))continue;try{visit(JSON.parse(line.slice(line.indexOf(':')+1)));}catch{}}
 }
 return facts;
}
