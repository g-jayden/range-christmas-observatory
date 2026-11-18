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
