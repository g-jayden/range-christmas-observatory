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
 const direct=String(html).match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
 if(direct)return JSON.parse(direct[1]).props.pageProps;
 const matches=[];const visit=v=>{if(Array.isArray(v))for(const x of v)visit(x);else if(v&&typeof v==='object'){if(v.pageProps?.productData&&v.pageProps.productMetadata)matches.push(v.pageProps);for(const x of Object.values(v))visit(x);}};
 for(const m of String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const payload=m[1].trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);if(!payload)continue;
  let outer;try{outer=JSON.parse(payload[1]);}catch{continue;}
  if(outer[0]!==1||typeof outer[1]!=='string')continue;
  for(const line of outer[1].split('\n')){if(!/^[a-f0-9]+:/.test(line))continue;try{visit(JSON.parse(line.slice(line.indexOf(':')+1)));}catch{}}
 }
 if(matches.length!==1)throw Error('Argos listing business props absent or ambiguous');return matches[0];
}
