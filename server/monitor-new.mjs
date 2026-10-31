import fs from 'node:fs/promises';import {sync,createReader} from './sync.mjs';import {parseDetails,productInformation} from './details.mjs';import {control} from './cloud-client.mjs';
import {retryingReader} from './retry-reader.mjs';
const tick=JSON.parse(await fs.readFile('runtime/tick.json','utf8'));if(!tick.monitor)process.exit(0);
const lease=tick.lease,key=process.env.FIRECRAWL_API_KEY;let scanned=0,newCount=0;
try{
 const quota=await fetch('https://api.firecrawl.dev/v2/team/credit-usage',{headers:{authorization:'Bearer '+key}}).then(r=>r.json());const credits=quota.data||quota;
 if(!(credits.remainingCredits>=40))throw Error('采集额度不足，监测暂停；不会虚报本轮无新品。');
 const previous=JSON.parse(await fs.readFile('web/catalogue.json','utf8')),reader=retryingReader(createReader({key,delayMs:credits.planCredits>=100000?250:6500}));
 const snapshot=await sync({previous,reader});scanned=snapshot.products.length;
 const plan=await control('/internal/monitor-plan',{lease,products:snapshot.products.map(p=>({sku:p.sku,sourceUrl:p.sourceUrl,newStatus:p.newStatus,kind:p.kind,variantName:p.variantName,priceGBP:p.priceGBP,variantImageUrl:p.variantImageUrl,imageUrl:p.imageUrl}))});
 const captureIssues=[];
 for(const p of plan.candidates){try{
  const capture=await reader.raw(p.sourceUrl,{formats:['rawHtml','markdown',{type:'screenshot',fullPage:true,quality:75,viewport:{width:1920,height:1080}}],waitFor:2000});
  const detail=parseDetails(capture,p.sku,p.sourceUrl); // Reject a screenshot of the wrong size/colour variant.
  const address=capture.data?.screenshot;if(!address)throw Error('SKU '+p.sku+'截图未生成，下一轮重试。');
  const u=new URL(address);if(u.protocol!=='https:')throw Error('Invalid screenshot transport');
  const image=await fetch(u,{signal:AbortSignal.timeout(30000)});if(!image.ok||!image.headers.get('content-type')?.startsWith('image/'))throw Error('SKU '+p.sku+'截图下载未完成。');
  const bytes=Buffer.from(await image.arrayBuffer());if(bytes.length>5000000)throw Error('SKU '+p.sku+'截图超过邮件限制，等待后续处理。');
  const info=productInformation(p,detail.specs);
  await control('/internal/event',{lease,product:{...p,description:info.summary,specifications:info.specifications},screenshotBase64:bytes.toString('base64'),screenshotVerifiedAt:detail.observedAt});newCount++;
 }catch(e){if([401,402,429].includes(e.status))throw e;captureIssues.push({sku:p.sku,error:String(e.message).replace(/fc-[\w-]+/g,'[redacted]')});}}
 let delivery;do{delivery=await control('/internal/deliver',{});}while(delivery.morePending);
 await control('/internal/monitor-complete',{lease,success:true,scanned,newCount});
 console.log(JSON.stringify({success:true,scanned,newCount,pendingScreenshotIssues:captureIssues,mail:'Only confirmed subscribers receive new events; no recipient data is logged.'}));
}catch(e){const technical=String(e.message).replace(/fc-[\w-]+/g,'[redacted]');const error=/credits|quota|额度/i.test(technical)?'采集额度不足，监测暂停，待额度恢复后自动继续。':/proxy|TUNNEL|timeout|fetch failed/i.test(technical)?'采集服务暂时连接失败，已保留历史记录，将自动重试。':'本轮源站检查未完成，已保留历史及待发送记录。';await control('/internal/monitor-complete',{lease,success:false,error,scanned,newCount}).catch(()=>{});console.error(technical);process.exitCode=1;}
