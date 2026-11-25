import{COMMITTED_RETAILERS,hasCommittedRetailerSource}from'./retailer-published.mjs';
import{isSpringScope}from'../web/spring-model.mjs';
import{SPRING_MONITOR_CONTRACT}from'../web/spring-monitor-contract.mjs';
import {retailerStorageSku,retailerForScope,retailerName,independentRetailer} from '../web/retailers.mjs';
const dayAt=now=>new Date(now+28800000).toISOString().slice(0,10);
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
export const DAILY_DIGEST_CONTRACT='one-complete-daily-pdf-v3';
const sentFor=(day,recipient)=>'digest-sent/'+day+'/'+recipient;
export const preparedDigestKey=(day,recipient)=>'digest-prepared/'+day+'/'+recipient;
const productFingerprint=rows=>digest(JSON.stringify(rows.map(p=>[p.digestProductKey,p]).sort((a,b)=>a[0].localeCompare(b[0]))));
// Preserve real provider receipts from the retired per-batch contract. A new
// deployment must not interpret a changed batch ID as permission to send again.
export async function migrateDailyDigestReceipts(db,day){
 const marker='digest-daily-receipt-migration/'+day;if(await db.get(marker))return;
 const grouped=new Map();for(const[key,r]of await db.list({prefix:'digest-batch-sent/'})){if(!Number.isFinite(Date.parse(r.acceptedAt))||dayAt(Date.parse(r.acceptedAt))!==day)continue;const p=await db.get('digest-plan/'+key.slice('digest-batch-sent/'.length));if(!p||p.test||p.day!==day||!p.recipient)continue;const keyFor=sentFor(day,p.recipient),rows=grouped.get(keyFor)||[];rows.push(r);grouped.set(keyFor,rows);}
 await db.transaction(async tx=>{for(const[key,rows]of grouped)if(!await tx.get(key)){rows.sort((a,b)=>Date.parse(a.acceptedAt)-Date.parse(b.acceptedAt));await tx.put(key,{...rows[0],migratedFromBatchReceipts:true,legacyBatches:rows.length});}await tx.put(marker,{day,checked:true});});
}
const eligible=(sub,p)=>!p.unavailableSince&&(!p.taxonomyAudit||p.taxonomyAudit.disposition==='include')&&sub.scopes.some(s=>!independentRetailer(p)&&s===p.kind||(p.departmentIds||[p.department]).includes(s))&&Date.parse(sub.confirmedAt)<=Date.parse(p.firstDetectedAt||p.detectedAt||p.firstNewObservedAt);
export async function digestSourceBarrier(db,scopes,now=Date.now()){
 const day=dayAt(now),start=Date.parse(day+'T06:00:00+08:00'),waiting=[];
 for(const id of new Set(scopes.map(s=>isSpringScope(s)?'spring':retailerForScope(s)))){const m=await db.get(id==='the-range'?'monitor':id+'-monitor'),at=id==='the-range'?m?.lastDiscoverySuccess:m?.observedAt;
  if(COMMITTED_RETAILERS.includes(id)&&!hasCommittedRetailerSource(m)||['nx','jl'].includes(id)&&(!m?.automaticArrivalChecks||m.collectionComplete!==true||!/^[a-f0-9]{40}$/.test(m.committedRevision||''))||id==='spring'&&m?.contract===SPRING_MONITOR_CONTRACT&&(!m.automaticArrivalChecks||m.collectionComplete!==true||!/^[a-f0-9]{40}$/.test(m.committedRevision||'')||m.evidencePending!==0)||!Number.isFinite(Date.parse(at))||Date.parse(at)<(['nx','jl'].includes(id)?Date.parse(day+'T06:00:00+08:00'):start)||Date.parse(at)>now)waiting.push({retailerId:id,lastVerifiedSourceAt:at||null});
 }
 return {ready:!waiting.length,day,waiting};
}
// The plan contains product facts and an opaque recipient ID. Email addresses
// never leave the private Worker and never appear in a public PDF manifest.
export async function dailyDigestPlans(db,{now=Date.now(),maxPlans=10,prepareAhead=false}={}){
 const day=dayAt(now),plans=[],waiting=[],hour=new Date(now+28800000).getUTCHours();if(hour<(prepareAhead?6:7))return{plans,waiting,day,notDue:true};
 await migrateDailyDigestReceipts(db,day);
 const events=await db.list({prefix:'event/'}),pending=await db.list({prefix:'pending/'}),subs=await db.list({prefix:'sub/'}),products=new Map([...events,...pending].map(([,p])=>[retailerStorageSku(p),p]));
 for(const[key,sub]of subs){if(!sub.confirmedAt)continue;
  const barrier=await digestSourceBarrier(db,sub.scopes,now);if(!barrier.ready)waiting.push({recipient:key.slice(4),retailers:barrier.waiting});if(await db.get(sentFor(day,key.slice(4)))||!barrier.ready)continue;
  const rows=[];for(const[k,p]of products)if(eligible(sub,p)&&!await db.get('delivered/'+k+'/'+key.slice(4)))rows.push({...p,digestProductKey:k});
  if(!rows.length)continue;
  rows.sort((a,b)=>a.digestProductKey.localeCompare(b.digestProductKey));
  const fingerprint=await productFingerprint(rows),id=await digest(DAILY_DIGEST_CONTRACT+'/'+day+'/'+key),intent=await db.get('digest-intent/'+day+'/'+key.slice(4)),frozen=intent?.planId===id?await db.get('digest-plan/'+id):null,plan=frozen||{id,contract:DAILY_DIGEST_CONTRACT,day,recipient:key.slice(4),createdAt:new Date(now).toISOString(),fingerprint,products:rows,waitingRetailers:[]};
  if(!frozen)await db.put('digest-plan/'+id,plan);plans.push(plan);if(plans.length>=maxPlans)break;
 }
 await db.put('daily-digest-status',{day,contract:DAILY_DIGEST_CONTRACT,checkedAt:new Date(now).toISOString(),state:plans.length?'ready':waiting.length?'waiting-for-current-source':'no-unsent-verified-products',waitingRetailers:[...new Set(waiting.flatMap(w=>w.retailers.map(r=>r.retailerId)))],reportsReady:plans.length});
 if(!plans.length){await db.put('daily-digest-product-status',{day,checkedAt:new Date(now).toISOString(),verifiedProducts:0,deferredProducts:0,state:'no-unsent-known-products',sourceVerificationPending:waiting.length>0});
  // The consolidated PDF queue is authoritative for delivery. An obsolete
  // per-product screenshot state must not report a delivery failure after every
  // eligible event has a receipt. Keep all pending evidence and seen history.
  const monitor=await db.get('monitor');if(!waiting.length&&['delivery-pending','delivery-blocked','delivery-waiting'].includes(monitor?.state)&&(await digestSourceBarrier(db,['tree'],now)).ready)await db.put('monitor',{...monitor,state:'active',stage:'complete',deliveryMode:'daily-native-pdf',pendingDeliveries:0,lastError:null,digestQueueCheckedAt:new Date(now).toISOString()});
 }
 return{day,plans,waiting,firecrawlCredits:0};
}
export async function dailyDigestOwnerTest(db,{ownerId,products,requestId,now=Date.now()}={}){
 if(!/^[a-f0-9]{64}$/.test(ownerId||'')||!Array.isArray(products)||products.length<1||products.length>16||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId||''))throw Error('Invalid owner-only PDF test');
 const sub=await db.get('sub/'+ownerId);if(!sub?.confirmedAt)throw Error('Confirmed owner subscription required');
 for(const p of products)if(!p.sourceUrl||!p.detailEvidence?.verifiedProductSection||p.detailEvidence.selectedSku!==p.sku||!Number.isFinite(p.priceGBP)||!p.originalImageEvidence?.sha256||!sub.scopes.some(s=>(p.departmentIds||[p.department]).includes(s)))throw Error('Owner PDF test requires verified products in the confirmed scope');
 const id=await digest('owner-pdf-test/'+requestId),plan={id,day:dayAt(now),recipient:ownerId,test:true,createdAt:new Date(now).toISOString(),products:products.map(p=>({...p,digestProductKey:retailerStorageSku(p)}))};await db.put('digest-plan/'+id,plan);return{day:plan.day,plans:[plan],waiting:[]};
}
export async function dailyDigestReadySubset(db,{planId,readyKeys,now=Date.now()}={}){
 const parent=await db.get('digest-plan/'+planId);if(!parent||parent.test||!Array.isArray(readyKeys)||!readyKeys.length||new Set(readyKeys).size!==readyKeys.length)throw Error('Invalid verified PDF subset');
 const known=new Set(parent.products.map(p=>p.digestProductKey));if(readyKeys.some(k=>!known.has(k)))throw Error('Verified PDF subset contains an unplanned product');
 const keys=new Set(readyKeys),products=parent.products.filter(p=>keys.has(p.digestProductKey));
 if(products.length===parent.products.length)return parent;
 await db.put('daily-digest-product-status',{day:parent.day,checkedAt:new Date(now).toISOString(),verifiedProducts:products.length,deferredProducts:parent.products.length-products.length,state:'waiting-for-complete-single-report'});throw Error('A single daily PDF cannot deliver a partial product subset; the entire report remains queued');
}
export async function dailyDigestOwnerCorrection(db,{ownerId,day,parentIds,requestId,now=Date.now()}={}){
 if(!/^[a-f0-9]{64}$/.test(ownerId||'')||!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||day!==dayAt(now)||!Array.isArray(parentIds)||!parentIds.length||new Set(parentIds).size!==parentIds.length||parentIds.some(id=>!/^[a-f0-9]{64}$/.test(id))||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId||''))throw Error('Invalid explicit owner consolidated correction');
 const sub=await db.get('sub/'+ownerId);if(!sub?.confirmedAt)throw Error('Confirmed owner subscription required');
 const rows=new Map(),parentReports=[];for(const id of parentIds){const p=await db.get('digest-plan/'+id),receipt=await db.get('digest-batch-sent/'+id)||await db.get(sentFor(day,ownerId));if(!p||p.test||p.correction||p.day!==day||p.recipient!==ownerId||!receipt||receipt.planId!==id)throw Error('Correction must refer to actual delivered reports for this owner and day');parentReports.push({id,revision:receipt.revision,pdfSha256:receipt.pdfSha256});for(const product of p.products)rows.set(product.digestProductKey,product);}
 const id=await digest('owner-consolidated-correction-v1/'+day+'/'+ownerId),plan={id,contract:DAILY_DIGEST_CONTRACT,correction:true,day,recipient:ownerId,parents:[...parentIds].sort(),parentReports,createdAt:new Date(now).toISOString(),products:[...rows.values()].sort((a,b)=>a.digestProductKey.localeCompare(b.digestProductKey))};
 const existing=await db.get('digest-plan/'+id);if(existing&&JSON.stringify(existing.parents)!==JSON.stringify(plan.parents))throw Error('The same daily correction cannot change its original delivered reports');await db.put('digest-plan/'+id,existing||plan);return{day,plans:[existing||plan],waiting:[]};
}
export function validateDigestManifest(plan,m){
 if(m?.version!=='daily-native-pdf-v1'||m.planId!==plan.id||m.day!==plan.day||!/^[a-f0-9]{64}$/.test(m.pdf?.sha256||'')||!Number.isInteger(m.pdf?.bytes)||m.pdf.bytes<1||!Array.isArray(m.items))throw Error('Invalid daily PDF manifest');
 if(m.planFingerprint&&m.planFingerprint!==plan.fingerprint)throw Error('Prepared daily PDF facts changed; rebuild the whole report');
 const planned=new Map(plan.products.map(p=>[p.digestProductKey,p])),covered=new Set();
 for(const item of m.items){const p=planned.get(item.key);if(!p||covered.has(item.key)||item.sku!==p.sku||item.sourceUrl!==p.sourceUrl||item.retailerId!==(p.retailerId==='the-range-gb'?'the-range':p.retailerId||'the-range')||!Number.isFinite(item.priceGBP)||item.priceGBP<0||typeof item.size!=='string'||!item.size||!/^https:\/\//.test(item.imageSourceUrl||'')||!/^[a-f0-9]{64}$/.test(item.imageSha256||''))throw Error('Daily PDF product identity or native image evidence mismatch');covered.add(item.key);}
 if(covered.size!==planned.size)throw Error('Daily PDF must cover every planned NEW product');
 return true;
}
export async function deliverDailyDigest(db,{body,send,origin,fetcher=fetch,now=Date.now()}={}){
 const{id,revision}=body||{};if(!/^[a-f0-9]{64}$/.test(id||'')||!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Invalid pinned digest publication');
 const plan=await db.get('digest-plan/'+id);if(!plan)throw Error('Daily PDF plan unavailable');
 if(body.fingerprint&&body.fingerprint!==plan.fingerprint)throw Error('Prepared daily PDF facts changed; rebuild the whole report');
 await migrateDailyDigestReceipts(db,plan.day);
 const sentKey=plan.test?'digest-test-sent/'+id:plan.correction?'digest-correction-sent/'+plan.day+'/'+plan.recipient:sentFor(plan.day,plan.recipient),already=await db.get(sentKey);if(already)return{accepted:true,alreadySent:true,products:already.products};
 if(!plan.test){if(plan.day!==dayAt(now)||plan.contract!==DAILY_DIGEST_CONTRACT||plan.parentId||plan.deferredProducts||plan.waitingRetailers?.length)throw Error('Only a complete current single daily report can be delivered');}
 if(!plan.test&&!plan.correction){const delivered=await Promise.all(plan.products.map(p=>db.get('delivered/'+p.digestProductKey+'/'+plan.recipient)));if(delivered.every(Boolean))return{accepted:true,alreadySent:true,products:plan.products.length};if(delivered.some(Boolean))throw Error('Some products were already delivered; rebuild a complete daily PDF');}
 const sub=await db.get('sub/'+plan.recipient);if(!sub?.confirmedAt||!plan.test&&plan.products.some(p=>!eligible(sub,p)))throw Error('Subscription changed before PDF delivery');
 if(!plan.test&&!plan.correction){if(!(await digestSourceBarrier(db,sub.scopes,now)).ready)throw Error('The whole daily report is waiting for every subscribed retailer source');if(!await db.get('digest-intent/'+plan.day+'/'+plan.recipient)){const candidates=new Map([...(await db.list({prefix:'event/'})),...(await db.list({prefix:'pending/'}))].map(([,p])=>[retailerStorageSku(p),p])),expected=[];for(const[k,p]of candidates)if(eligible(sub,p)&&!await db.get('delivered/'+k+'/'+plan.recipient))expected.push({...p,digestProductKey:k});if(await productFingerprint(expected)!==plan.fingerprint)throw Error('The daily product queue changed; rebuild the whole single PDF before sending');}}
 const root='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/'+revision+'/web/reports/'+id+'/',r=await fetcher(root+'manifest.json',{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Pinned daily PDF manifest HTTP '+r.status);
 const m=await r.json();validateDigestManifest(plan,m);
 if(plan.correction&&(m.correction!==true||JSON.stringify([...(m.originalReports||[])].sort())!==JSON.stringify(plan.parents)))throw Error('Consolidated correction must cover the original delivered report manifests');
 const large=m.pdf.bytes>14000000;
 const pdf=await fetcher(root+'NEW.pdf',{method:large?'HEAD':'GET',signal:AbortSignal.timeout(30000)});if(!pdf.ok)throw Error('Pinned daily PDF HTTP '+pdf.status);
 if(large){if(Number(pdf.headers.get('content-length'))!==m.pdf.bytes)throw Error('Pinned daily PDF size mismatch');}
 else{const bytes=await pdf.arrayBuffer();if(bytes.byteLength!==m.pdf.bytes)throw Error('Daily PDF byte length mismatch');
 const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(actual!==m.pdf.sha256||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('Daily PDF native document digest mismatch');}
 // Build and verify the one immutable document after the 06:00 source closure.
 // Its publication is durable before 07:00; no mail or provider intent exists yet.
 if(!plan.test&&!plan.correction&&new Date(now+28800000).getUTCHours()<7){
  const notBefore=plan.day+'T07:00:00+08:00';
  await db.put(preparedDigestKey(plan.day,plan.recipient),{id:plan.id,day:plan.day,recipient:plan.recipient,revision,fingerprint:plan.fingerprint,products:plan.products.length,pdfSha256:m.pdf.sha256,preparedAt:new Date(now).toISOString(),notBefore});
  await db.put('daily-digest-prepared-status',{day:plan.day,preparedAt:new Date(now).toISOString(),products:plan.products.length,notBefore,state:'verified-single-report-waiting-for-0700'});
  return{accepted:true,scheduled:true,mailSent:false,notBefore,products:plan.products.length,firecrawlCredits:0};
 }
 // Brevo's API limit includes MIME/base64 overhead. Keep one original PDF;
 // a large report is a direct file link rather than resized source photos.
 const retailers=[...new Set(plan.products.map(p=>retailerName(p.retailerId)))],html='<div style="font:16px/1.8 Arial,sans-serif;color:#173c32"><h2>今日新品汇总 · Daily NEW products</h2>'+ (plan.test?'<p>这是使用真实官网商品的排版测试，不代表今天新增。This is a layout test with real source products; it does not claim a new discovery today.</p>':'')+'<p>'+plan.day+' · '+plan.products.length+' 款 / products</p><p>'+retailers.join(' · ')+'</p><p>全部新品集中在一个 PDF 文档中，按连锁店与类目排列，每页八张官网原图，附中英产品名、官网价格和尺寸。<br>One PDF, grouped by retailer and department. Eight original source photos per page, with Chinese and English product names, source prices and sizes.</p><p><a href="'+root+'NEW.pdf">下载完整 PDF · Download full PDF</a></p><p><a href="'+origin+'/unsubscribe?token='+encodeURIComponent(sub.unsubscribe)+'">取消订阅 · Unsubscribe</a></p></div>';
 const intentKey=plan.test?'digest-test-intent/'+id:plan.correction?'digest-correction-intent/'+plan.day+'/'+plan.recipient:'digest-intent/'+plan.day+'/'+plan.recipient;let allowed=false,concurrentReceipt;
 await db.transaction(async tx=>{concurrentReceipt=await tx.get(sentKey);if(concurrentReceipt)return;const prior=await tx.get(intentKey);if(prior&&(prior.planId!==id||prior.pdfSha256&&prior.pdfSha256!==m.pdf.sha256||now-Date.parse(prior.at)<120000))throw Error('Daily PDF delivery is already in progress; keep other products queued');if(prior&&now-Date.parse(prior.firstAt)>25*60000)throw Error('Prior provider acknowledgement is uncertain; verify the provider receipt before sending again');for(const p of plan.test||plan.correction?[]:plan.products)if(await tx.get('delivered/'+p.digestProductKey+'/'+plan.recipient))throw Error('Product delivery changed; rebuild the complete daily PDF');await tx.put(intentKey,{at:new Date(now).toISOString(),firstAt:prior?.firstAt||new Date(now).toISOString(),planId:id,pdfSha256:m.pdf.sha256});allowed=true;});
 if(concurrentReceipt)return{accepted:true,alreadySent:true,products:concurrentReceipt.products};
 if(!allowed)throw Error('Daily PDF delivery lease unavailable');
 const pendingNote=plan.correction?'<p>此前分开发送的 '+plan.parents.length+' 份报告现已合并为这一份，共 '+plan.products.length+' 款去重商品；这是合并更正，不代表另外发现这些新品。<br>This correction combines the previously sent reports into one document; these are not additional new discoveries.</p>':'<p>当天所有订阅店铺统一汇总，每位收件人每天只发一份；发送后到达的数据保留至下一次每日汇总。<br>One complete daily report per recipient across subscribed retailers. Data arriving after delivery remains queued for the next daily report.</p>';
 const content='<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+html.replace('</div>',pendingNote+'</div>')+'</body></html>';
 const providerId=await send(sub.email,(plan.test?'【测试 · Test】':plan.correction?'【合并更正 · Consolidated】':'')+(plan.products.some(p=>p.collectionId==='spring')?'季节新品汇总':'圣诞新品汇总')+' · Daily NEW · '+plan.day,content,large?[]:[{name:(plan.products.some(p=>p.collectionId==='spring')?'Seasonal-NEW-':'Christmas-NEW-')+plan.day+(plan.correction?'-Consolidated':'')+'.pdf',url:root+'NEW.pdf'}],await digest(plan.test?'owner-pdf-test/'+id:(plan.correction?'owner-consolidated-correction-v1/':'single-daily-pdf-v3/')+plan.day+'/'+plan.recipient));
 const receipt={acceptedAt:new Date(now).toISOString(),providerId,products:plan.products.length,planId:id,revision,pdfSha256:m.pdf.sha256};
 await db.transaction(async tx=>{await tx.put(sentKey,receipt);for(const p of plan.test||plan.correction?[]:plan.products){const key=p.digestProductKey;await tx.put('delivered/'+key+'/'+plan.recipient,receipt);await tx.put('seen/'+key,true);}if(tx.delete)await tx.delete(intentKey);await tx.put(plan.test?'last-daily-digest-test':plan.correction?'last-daily-digest-correction':'last-daily-digest',{day:plan.day,acceptedAt:receipt.acceptedAt,products:receipt.products,pdfSha256:receipt.pdfSha256,waitingRetailers:[]});if(!plan.test&&!plan.correction)await tx.put('daily-digest-product-status',{day:plan.day,checkedAt:receipt.acceptedAt,verifiedProducts:receipt.products,deferredProducts:0,state:'provider-accepted-complete-daily-report'});});
 return{accepted:true,products:receipt.products,firecrawlCredits:0};
}
