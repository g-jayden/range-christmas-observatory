import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {control} from '../server/cloud-client.mjs';
const out=JSON.parse(await fs.readFile('runtime/daily-digest-outbox.private.json','utf8')),revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();let accepted=0;const failures=[];
for(const p of out.prepared)try{const receipt=await control('/internal/digest-ready',{id:p.id,revision});if(!receipt.accepted)throw Error('Provider did not acknowledge daily PDF');accepted++;}catch(e){failures.push({id:p.id,error:String(e.message).slice(0,250)});}
console.log(JSON.stringify({phase:'Consolidated daily PDF delivery',accepted,failures,firecrawlCredits:0}));if(failures.length)process.exitCode=1;
