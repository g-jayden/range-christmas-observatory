import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {rebuildStoredRangeViews} from '../server/rebuild-range-views.mjs';
import {rangeNativeTargets,validateRangeNativeEntry,committedNativeMirror} from '../server/range-native-plan.mjs';
const read=async name=>JSON.parse(await fs.readFile('web/'+name,'utf8'));
const [range,index,paid,checkpoint]=await Promise.all([
 rebuildStoredRangeViews({persist:false,includeProducts:true,verifyImageFiles:false}),
 read('range-native-index.json'),read('paid-native-index.json'),
 read('range-native-checkpoint.json').catch(e=>{if(e.code==='ENOENT')return{entries:{}};throw e;})
]);
if(!range.rebuilt)throw Error('Current canonical Range source required for source-free audit');
const tracked=new Set(execFileSync('git',['ls-files','-z','web/images/source'],{encoding:'utf8',maxBuffer:67108864}).split('\0'));
const remaining=[];let verified=0;
for(const [url,target] of rangeNativeTargets(range.products)){
 const entry=index.entries?.[url],alternate=paid.entries?.[url];let error;
 try{validateRangeNativeEntry(target,entry);if(!committedNativeMirror(entry,tracked))throw Error('Native response bytes are not committed');verified++;continue;}catch(e){error={message:e.message,code:e.code};}
 const product=range.products.find(p=>String(p.sku)===String(target.sku));
 remaining.push({...target,error,current:entry,paid:alternate,checkpoint:checkpoint.entries?.[url],name:product?.variantName,department:product?.department,gallery:product?.originalImages});
}
const report={checkedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID,verified,remainingCount:remaining.length,remaining,sourceRequests:0,firecrawlCredits:0};
await fs.mkdir('runtime',{recursive:true});await fs.writeFile('runtime/native-recovery-diagnostics.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,remaining:remaining.slice(0,30)}));
