import {retailerStorageSku,retailerForScope,retailerName,independentRetailer} from '../web/retailers.mjs';
const dayAt=now=>new Date(now+28800000).toISOString().slice(0,10);
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const eligible=(sub,p)=>!p.unavailableSince&&(!p.taxonomyAudit||p.taxonomyAudit.disposition==='include')&&sub.scopes.some(s=>!independentRetailer(p)&&s===p.kind||(p.departmentIds||[p.department]).includes(s))&&Date.parse(sub.confirmedAt)<=Date.parse(p.firstDetectedAt||p.detectedAt||p.firstNewObservedAt);
export async function digestSourceBarrier(db,scopes,now=Date.now()){
 const day=dayAt(now),start=Date.parse(day+'T07:00:00+08:00'),waiting=[];
 for(const id of new Set(scopes.map(retailerForScope))){const m=await db.get(id==='the-range'?'monitor':id+'-monitor'),at=id==='the-range'?m?.lastDiscoverySuccess:m?.observedAt;
  if(!Number.isFinite(Date.parse(at))||Date.parse(at)<start||Date.parse(at)>now)waiting.push({retailerId:id,lastVerifiedSourceAt:at||null});
 }
 return {ready:!waiting.length,day,waiting};
}
// The plan contains product facts and an opaque recipient ID. Email addresses
// never leave the private Worker and never appear in a public PDF manifest.
export async function dailyDigestPlans(db,{now=Date.now(),maxPlans=10}={}){
 const day=dayAt(now),plans=[],waiting=[];if(new Date(now+28800000).getUTCHours()<7)return{plans,waiting,day,notDue:true};
 const events=await db.list({prefix:'event/'}),pending=await db.list({prefix:'pending/'}),subs=await db.list({prefix:'sub/'}),products=new Map([...events,...pending].map(([,p])=>[retailerStorageSku(p),p]));
 for(const[key,sub]of subs){if(!sub.confirmedAt||await db.get('digest-sent/'+day+'/'+key.slice(4)))continue;
  const barrier=await digestSourceBarrier(db,sub.scopes,now);if(!barrier.ready){waiting.push({recipient:key.slice(4),retailers:barrier.waiting});continue;}
  const rows=[];for(const[k,p]of products)if(eligible(sub,p)&&!await db.get('delivered/'+k+'/'+key.slice(4)))rows.push({...p,digestProductKey:k});
  if(!rows.length)continue;
  rows.sort((a,b)=>a.digestProductKey.localeCompare(b.digestProductKey));
  const fingerprint=await digest(JSON.stringify(rows.map(p=>[p.digestProductKey,p.sourceUrl,p.firstDetectedAt||p.detectedAt||p.firstNewObservedAt]))),id=await digest(day+'/'+key+'/'+fingerprint),plan={id,day,recipient:key.slice(4),createdAt:new Date(now).toISOString(),fingerprint,products:rows};
  await db.put('digest-plan/'+id,plan);plans.push(plan);if(plans.length>=maxPlans)break;
 }
 await db.put('daily-digest-status',{day,checkedAt:new Date(now).toISOString(),state:waiting.length?'waiting-for-current-source':plans.length?'ready':'no-unsent-verified-products',waitingRetailers:[...new Set(waiting.flatMap(w=>w.retailers.map(r=>r.retailerId)))],reportsReady:plans.length});
 return{day,plans,waiting,firecrawlCredits:0};
}
export async function dailyDigestOwnerTest(db,{ownerId,products,requestId,now=Date.now()}={}){
 if(!/^[a-f0-9]{64}$/.test(ownerId||'')||!Array.isArray(products)||products.length<1||products.length>16||!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId||''))throw Error('Invalid owner-only PDF test');
 const sub=await db.get('sub/'+ownerId);if(!sub?.confirmedAt)throw Error('Confirmed owner subscription required');
 for(const p of products)if(!p.sourceUrl||!p.detailEvidence?.verifiedProductSection||p.detailEvidence.selectedSku!==p.sku||!Number.isFinite(p.priceGBP)||!p.originalImageEvidence?.sha256||!sub.scopes.some(s=>(p.departmentIds||[p.department]).includes(s)))throw Error('Owner PDF test requires verified products in the confirmed scope');
 const id=await digest('owner-pdf-test/'+requestId),plan={id,day:dayAt(now),recipient:ownerId,test:true,createdAt:new Date(now).toISOString(),products:products.map(p=>({...p,digestProductKey:retailerStorageSku(p)}))};await db.put('digest-plan/'+id,plan);return{day:plan.day,plans:[plan],waiting:[]};
}
export function validateDigestManifest(plan,m){
 if(m?.version!=='daily-native-pdf-v1'||m.planId!==plan.id||m.day!==plan.day||!/^[a-f0-9]{64}$/.test(m.pdf?.sha256||'')||!Number.isInteger(m.pdf?.bytes)||m.pdf.bytes<1||!Array.isArray(m.items))throw Error('Invalid daily PDF manifest');
 const planned=new Map(plan.products.map(p=>[p.digestProductKey,p])),covered=new Set();
 for(const item of m.items){const p=planned.get(item.key);if(!p||covered.has(item.key)||item.sku!==p.sku||item.sourceUrl!==p.sourceUrl||item.retailerId!==(p.retailerId==='the-range-gb'?'the-range':p.retailerId||'the-range')||!Number.isFinite(item.priceGBP)||item.priceGBP<0||typeof item.size!=='string'||!item.size||!/^https:\/\//.test(item.imageSourceUrl||'')||!/^[a-f0-9]{64}$/.test(item.imageSha256||''))throw Error('Daily PDF product identity or native image evidence mismatch');covered.add(item.key);}
 if(covered.size!==planned.size)throw Error('Daily PDF must cover every planned NEW product');
 return true;
}
export async function deliverDailyDigest(db,{body,send,origin,fetcher=fetch,now=Date.now()}={}){
 const{id,revision}=body||{};if(!/^[a-f0-9]{64}$/.test(id||'')||!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Invalid pinned digest publication');
 const plan=await db.get('digest-plan/'+id);if(!plan)throw Error('Daily PDF plan unavailable');
 const sentKey=plan.test?'digest-test-sent/'+id:'digest-sent/'+plan.day+'/'+plan.recipient,already=await db.get(sentKey);if(already)return{accepted:true,alreadySent:true,products:already.products};
 const sub=await db.get('sub/'+plan.recipient);if(!sub?.confirmedAt||!plan.test&&plan.products.some(p=>!eligible(sub,p)))throw Error('Subscription changed before PDF delivery');
 const root='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/'+revision+'/web/reports/'+id+'/',r=await fetcher(root+'manifest.json',{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Pinned daily PDF manifest HTTP '+r.status);
 const m=await r.json();validateDigestManifest(plan,m);
 const large=m.pdf.bytes>14000000;
 const pdf=await fetcher(root+'NEW.pdf',{method:large?'HEAD':'GET',signal:AbortSignal.timeout(30000)});if(!pdf.ok)throw Error('Pinned daily PDF HTTP '+pdf.status);
 if(large){if(Number(pdf.headers.get('content-length'))!==m.pdf.bytes)throw Error('Pinned daily PDF size mismatch');}
 else{const bytes=await pdf.arrayBuffer();if(bytes.byteLength!==m.pdf.bytes)throw Error('Daily PDF byte length mismatch');
 const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(actual!==m.pdf.sha256||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('Daily PDF native document digest mismatch');}
 // Brevo's API limit includes MIME/base64 overhead. Keep one original PDF;
 // a large report is a direct file link rather than resized source photos.
 const retailers=[...new Set(plan.products.map(p=>retailerName(p.retailerId)))],html='<div style="font:16px/1.8 Arial,sans-serif;color:#173c32"><h2>今日新品汇总 · Daily NEW products</h2>'+ (plan.test?'<p>这是使用真实官网商品的排版测试，不代表今天新增。This is a layout test with real source products; it does not claim a new discovery today.</p>':'')+'<p>'+plan.day+' · '+plan.products.length+' 款 / products</p><p>'+retailers.join(' · ')+'</p><p>全部新品集中在一个 PDF 文档中，按连锁店与类目排列，每页八张官网原图，附官网价格和尺寸。<br>One PDF, grouped by retailer and department. Eight original source photos per page, with source prices and sizes.</p><p><a href="'+root+'NEW.pdf">下载完整 PDF · Download full PDF</a></p><p><a href="'+origin+'/unsubscribe?token='+encodeURIComponent(sub.unsubscribe)+'">取消订阅 · Unsubscribe</a></p></div>';
 const intentKey=plan.test?'digest-test-intent/'+id:'digest-intent/'+plan.day+'/'+plan.recipient;let allowed=false;
 await db.transaction(async tx=>{const prior=await tx.get(intentKey);if(prior&&now-Date.parse(prior.at)<120000)throw Error('Daily PDF delivery is already in progress');if(prior&&now-Date.parse(prior.firstAt)>25*60000)throw Error('Prior provider acknowledgement is uncertain; verify the provider receipt before sending again');await tx.put(intentKey,{at:new Date(now).toISOString(),firstAt:prior?.firstAt||new Date(now).toISOString(),planId:id});allowed=true;});
 if(!allowed)throw Error('Daily PDF delivery lease unavailable');
 const providerId=await send(sub.email,(plan.test?'【测试 · Test】':'')+'圣诞新品汇总 · Daily NEW · '+plan.day,html,large?[]:[{name:'Christmas-NEW-'+plan.day+'.pdf',url:root+'NEW.pdf'}],await digest(plan.test?'owner-pdf-test/'+id:'daily-native-pdf-v1/'+plan.day+'/'+plan.recipient));
 const receipt={acceptedAt:new Date(now).toISOString(),providerId,products:plan.products.length,planId:id,revision,pdfSha256:m.pdf.sha256};
 await db.transaction(async tx=>{await tx.put(sentKey,receipt);for(const p of plan.test?[]:plan.products){const key=p.digestProductKey;await tx.put('delivered/'+key+'/'+plan.recipient,receipt);await tx.put('seen/'+key,true);}await tx.put(plan.test?'last-daily-digest-test':'last-daily-digest',{day:plan.day,acceptedAt:receipt.acceptedAt,products:receipt.products,pdfSha256:receipt.pdfSha256});});
 return{accepted:true,products:receipt.products,firecrawlCredits:0};
}
