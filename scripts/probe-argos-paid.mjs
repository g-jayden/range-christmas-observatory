// Reuse the existing diagnostic entrypoint for free native-media acceptance.
// This script makes no Firecrawl API request and never reads its API key.
import fs from 'node:fs/promises';
const dir='runtime/argos-paid-acceptance';await fs.mkdir(dir,{recursive:true});
const report={phase:'Argos standard native media acceptance',firecrawlCredits:0,results:[]};
for(const id of ['022fwn7m_R_Z001A','8763057_R_Z001A'])for(const suffix of ['.json?metadata=true','']){
 const url='https://media.4rgos.it/i/Argos/'+id+suffix;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)}),b=Buffer.from(await r.arrayBuffer()),type=r.headers.get('content-type')||'';report.results.push({url,status:r.status,type,bytes:b.length});if(r.ok&&b.length<25000000)await fs.writeFile(dir+'/'+id+(suffix?'.json':'.image'),b);}catch(e){report.results.push({url,error:String(e.message)});}
}
await fs.writeFile(dir+'/native-media.json',JSON.stringify(report));console.log(JSON.stringify(report));
