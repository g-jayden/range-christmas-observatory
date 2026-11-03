import {DEPARTMENTS,DEPARTMENT_MAP,colourLabel,STYLE_EN,sourcePrice} from '../web/catalogue-model.mjs';
import {firstRun,advanceRun,scheduleLabel,nextNewCheck,advanceNewCheck} from '../server/schedule.mjs';
import {dispatchDue} from './dispatch-clock.mjs';
const SITE='https://g-jayden.github.io';
const HOME=SITE+'/range-christmas-observatory/';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const allowedScopes=DEPARTMENTS.map(d=>d.id);
const accepts=(sub,p)=>sub.scopes.some(scope=>scope===p.kind||(p.departmentIds||[p.department]).includes(scope));
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const validEmail=s=>typeof s==='string'&&s.length<=254&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(s);
function response(value,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store'}})}
function checkAuth(req,secret){if(!secret||req.headers.get('authorization')!=='Bearer '+secret)throw Object.assign(Error('无权执行此操作。'),{status:401});}
function verifyUrl(raw,hosts){const u=new URL(raw);if(u.protocol!=='https:'||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('非允许的来源地址。');return u.href;}
function mailAssets(p){
 const m=p.mailAssets;if(!m?.card?.url||!m?.original?.url)throw Error('完整信息卡或官网原图尚未生成');
 const allowed=raw=>{const u=new URL(raw);if(u.origin!==SITE||!u.pathname.startsWith('/range-christmas-observatory/mail-assets/'+p.sku+'/'))throw Error('Invalid generated mail asset');return u.href;};
 return [{name:'NEW-'+p.sku+'-card.png',url:allowed(m.card.url)},{name:'NEW-'+p.sku+'-original.'+new URL(m.original.url).pathname.split('.').pop(),url:allowed(m.original.url)},...(m.proof?.url?[{name:'NEW-'+p.sku+'-source-page.png',url:allowed(m.proof.url)}]:[])];
}
function productMail(p,origin,test=false,unsubscribe=null){
 const m=p.mailAssets,has=m?.card?.url&&m?.original?.url;if(has)mailAssets(p);
 const checked=p.newEvidence?.observedAt||p.observedAt||p.detectedAt;
 const header=test?'测试示例 · Test example; source NEW, not a first discovery today':'NEW · '+(DEPARTMENT_MAP[p.kind==='decoration'?p.department:p.kind]?.label||'圣诞装饰品 · Christmas Decorations');
 const ext=has?new URL(m.original.url).pathname.split('.').pop():null;
 const price=sourcePrice(p);
 const attributes=[['SKU',p.sku],['价格 · Price','£'+Number(p.priceGBP).toFixed(2)],...(price.reduced?[['原站划线原价 · Source original price','£'+(price.originalPence/100).toFixed(2)]]:[]),...(price.promoText?[['原站促销 · Source offer',price.promoText]]:[]),['尺寸 · Size',p.kind==='tree'?p.heightLabel:p.dimensions?.label||p.skirtDiameterCm&&p.skirtDiameterCm+'cm'||'原站未注明 · Not specified'],['本体颜色 · Body colours',(p.colorValues||[]).map(colourLabel).join(' / ')||p.treeColor||'待核验 · Unconfirmed'],['材质 · Materials',p.material||'原站未注明 · Not specified']];
 if(p.kind==='tree')attributes.push(['分类 · Shape',p.style+' · '+(STYLE_EN[p.style]||'Other')]);
 return `<div style="font:16px/1.8 Arial,sans-serif;max-width:900px;margin:auto;color:#173c32"><p>${esc(header)}</p><h1>${esc(p.variantName)}</h1>${has?`<p style="background:#eef4ed;padding:14px">直接保存到手机：长按下方图片选择“保存图片／存储图像”，或打开邮件底部的图片附件保存。<br>Long-press an image to save it, or open the image attachments below.<br>完整信息卡 · Product card: NEW-${esc(p.sku)}-card.png<br>官网原图 · Source original: NEW-${esc(p.sku)}-original.${esc(ext)}</p><h2>完整商品信息卡 · Full product card</h2><img src="${esc(m.card.url)}" alt="完整商品信息卡 · Full product card; long-press to save" width="900" style="display:block;width:100%;max-width:900px;height:auto;border:0"><h2>官网原图 · Original product photo</h2><img src="${esc(m.original.url)}" alt="官网原图 · Original source photo; long-press to save" width="900" style="display:block;width:100%;max-width:900px;height:auto;border:0"><p>官网原图 ${Number(m.original.width)}×${Number(m.original.height)} 像素，原文件未经放大或二次压缩；保存附件可保留原始文件。<br>Original source bytes, with no enlargement or recompression. Save the attachment to retain the original file.</p>`:`<img src="${origin}/shots/${p.imageAccess}" alt="具体SKU原站截图 · Exact SKU source screenshot" style="width:100%;height:auto">`}<p>${attributes.map(([label,value])=>esc(label)+'：'+esc(value)).join('<br>')}</p><p><a href="${esc(p.sourceUrl)}">查看原站具体SKU购买页 · View exact SKU product page</a></p><p style="font-size:13px;color:#607168">价格与NEW核验 · Price / NEW checked: ${esc(checked)}。下单时以官网为准 · Confirm live details before purchase.${test?' 本测试不改变新品基线 · This test does not change the NEW baseline.':''}</p><p>${unsubscribe?`<a href="${esc(unsubscribe)}">取消订阅 · Unsubscribe</a> · `:''}<a href="${HOME}">查看分析网站 · View analysis</a></p></div>`;
}
export class Control{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.db=ctx.storage;}
 async config(){return await this.db.get('config')||firstRun();}
 async monitorState(){
  const m=await this.db.get('monitor')||{};
  if(m.scheduleVersion!=='daily-0700-v1'){delete m.intervalMinutes;Object.assign(m,{scheduleVersion:'daily-0700-v1',schedule:'每天北京时间07:00检查，有新款才推送',time:'07:00',timezone:'Asia/Shanghai',nextRunAt:nextNewCheck(),state:m.lastSuccess?'active':'not-started'});await this.db.put('monitor',m)}
  return m;
 }
 async deliveryStatus(){
  const events=await this.db.list({prefix:'event/'}),subs=await this.db.list({prefix:'sub/'});let pendingDeliveries=0;
  for(const p of events.values())for(const [key,sub]of subs)if(sub.confirmedAt&&Date.parse(sub.confirmedAt)<=Date.parse(p.detectedAt)&&accepts(sub,p)&&!await this.db.get('delivered/'+p.sku+'/'+key.slice(4)))pendingDeliveries++;
  return {pendingDeliveries,lastDelivery:await this.db.get('last-delivery')||null};
 }
 async send(to,subject,html,attachments=[],idempotencyKey){
  if(!this.env.BREVO_API_KEY||!this.env.MAIL_FROM)throw Object.assign(Error('邮件服务尚未连接，尚未发送邮件。'),{status:503});
  // Brevo limits this header's length. Keep one stable 36-character ID per event/recipient.
  const k=idempotencyKey&&String(idempotencyKey),providerKey=k?[k.slice(0,8),k.slice(8,12),'5'+k.slice(13,16),'8'+k.slice(17,20),k.slice(20,32)].join('-'):null;
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':this.env.BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:{email:this.env.MAIL_FROM,name:'圣诞新品观察'},to:[{email:to}],subject,htmlContent:html,...(providerKey?{headers:{idempotencyKey:providerKey}}:{}),...(attachments.length?{attachment:attachments}:{})}),signal:AbortSignal.timeout(20000)});
  if(!r.ok){let detail;try{detail=await r.json()}catch{}throw Object.assign(Error('邮件服务未接受邮件，请稍后重试。'),{status:502,providerStatus:r.status,providerCode:String(detail?.code||'unknown'),providerMessage:String(detail?.message||'').slice(0,500)});}
  return (await r.json()).messageId;
 }
 async fetch(req){
  try{return await this.route(req)}catch(e){const privateRoute=/^\/(internal|admin)\//.test(new URL(req.url).pathname);return response({error:e.status?e.message:'操作未完成，请稍后重试。',...(privateRoute&&e.providerStatus?{providerStatus:e.providerStatus,providerCode:e.providerCode,providerMessage:e.providerMessage}:{}),...(privateRoute&&e.assetStatus?{assetStatus:e.assetStatus,assetName:e.assetName,assetContentType:e.assetContentType}:{})},e.status||500)}
 }
 async route(req){
  const url=new URL(req.url),route=url.pathname;
  if(route==='/public/status'&&req.method==='GET'){
   const config=await this.config(),monitor=await this.monitorState(),clock=await this.db.get('dispatch-clock');
   const dispatchClock={enabled:Boolean(this.env.GITHUB_DISPATCH_TOKEN),lastAttemptAt:clock?.lastAttemptAt||null,lastAcceptedAt:clock?.lastAcceptedAt||null,lastStatus:clock?.lastStatus||null,attempts:clock?.attempts||0};
   const pending=[...(await this.db.list({prefix:'pending/'})).values()];return response({config,schedule:scheduleLabel(config),dispatchClock,baselineReady:Boolean(await this.db.get('seeded')),monitor:{...monitor,...await this.deliveryStatus(),pendingScreenshots:pending.filter(p=>!p.unavailableSince).length,pendingUnavailable:pending.filter(p=>p.unavailableSince).length},mailReady:Boolean(this.env.BREVO_API_KEY&&this.env.MAIL_FROM),recent:await this.db.get('recent')||[]});
  }
  if(route.startsWith('/shots/')&&req.method==='GET'){
   const access=route.slice(7);if(!/^[a-f\d]{64}$/.test(access))return response({error:'Not found'},404);
   const sku=await this.db.get('image-access/'+access),event=sku&&await this.db.get('event/'+sku);if(!event)return response({error:'Image expired; use email attachment'},404);
   const chunks=[];for(let i=0;i<event.screenshotParts;i++)chunks.push(await this.db.get('shot/'+sku+'/'+i));
   return new Response(Uint8Array.from(atob(chunks.join('')),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png','cache-control':'public,max-age=86400'}});
  }
  if(['/confirm','/unsubscribe'].includes(route)&&req.method==='GET'){
   const raw=url.searchParams.get('token')||'';if(raw.length>160)return response({error:'无效链接'},400);
   const label=route==='/confirm'?'确认订阅新品邮件 · Confirm subscription':'确认取消新品邮件 · Confirm unsubscribe';
   return new Response(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label}</title><body style="font:18px/1.8 system-ui;padding:30px;max-width:650px;margin:auto"><h1>${label}</h1><p>订阅所选圣诞品类。每天北京时间07:00检查，有新品才发送信息卡、原图与购买链接。<br>Selected Christmas departments; checked daily at 07:00 Beijing time. Email only for newly discovered NEW products, with product cards and original photos.</p><form method="post"><input type="hidden" name="token" value="${esc(raw)}"><button style="font:inherit;padding:12px">${label}</button></form><p><a href="${HOME}">返回产品分析网站 · View analysis</a></p></body></html>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
  }
  if(['/confirm','/unsubscribe'].includes(route)&&req.method==='POST'){
   const form=await req.formData(),key=await hash(String(form.get('token')||'')),record=await this.db.get('token/'+key);
   if(!record||record.action!==route||record.expires<Date.now())return response({error:'链接失效，请回网站重新申请。'},400);
   const sub=await this.db.get('sub/'+record.id);if(!sub)return response({error:'订阅不存在'},400);
   if(route==='/confirm'){sub.confirmedAt=new Date().toISOString();await this.db.put('sub/'+record.id,sub);await this.db.delete('token/'+key)}
   else{await this.db.delete('sub/'+record.id);await this.db.delete('token/'+key)}
   return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>${route==='/confirm'?'订阅已确认 · Subscription confirmed. 只推送订阅后新发现的NEW，不补发已有基线商品 · Existing baseline products are excluded.':'已取消订阅 · Unsubscribed.'}</p><a href="${HOME}">返回网站 · View analysis</a>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
  }
  if(req.method==='POST'&&route==='/unsubscribe-by-email'){
   const b=await req.json(),email=String(b.email||'').trim().toLowerCase();if(!validEmail(email))return response({error:'请输入一个有效邮箱地址。'},400);
   const id=await hash(email);await this.db.delete('sub/'+id);
   for(const [key,value]of await this.db.list({prefix:'token/'}))if(value.id===id)await this.db.delete(key);
   return response({message:'该邮箱的新品邮件订阅已取消，后续不再推送。'});
  }
  if(req.method==='POST'&&route==='/subscribe'){
   const body=await req.json(),email=String(body.email||'').trim().toLowerCase();
   if(!validEmail(email))return response({error:'请输入一个有效邮箱地址。'},400);
   if(!this.env.BREVO_API_KEY||!this.env.MAIL_FROM)return response({error:'邮件服务尚未完成连接，订阅尚未保存或发送。'},503);
   const id=await hash(email),old=await this.db.get('sub/'+id),limitKey='rate/'+await hash(req.headers.get('cf-connecting-ip')||'unknown');
   if(old?.confirmedAt)return response({message:'该邮箱已有已确认的订阅，无需重复申请；修改范围可先从原邮件取消订阅。'});
   const hour=Math.floor(Date.now()/3600000),rate=await this.db.get(limitKey)||{hour,count:0};if(rate.hour!==hour){rate.hour=hour;rate.count=0}
   if(rate.count>=5||old&&Date.now()-old.requestedAt<60000)return response({error:'申请过于频繁，请稍后重试。'},429);
   rate.count++;await this.db.put(limitKey,rate);
   const confirm=token(),unsub=token(),now=Date.now(),scopes=allowedScopes.filter(x=>(body.scopes||['tree','skirt']).includes(x));if(!scopes.length)return response({error:'至少选择一个产品范围。'},400);
   await this.send(email,'请确认 · Confirm Christmas NEW subscription',`<h2>确认接收圣诞新品 · Confirm subscription</h2><p>每天北京时间07:00检查所选品类，有新品才发邮件，包含完整信息卡、官网原图与具体SKU购买链接。<br>Selected departments are checked daily at 07:00 Beijing time. New discoveries include product cards, original source photos and exact SKU links.</p><p>订阅范围 · Departments: ${scopes.map(id=>esc(DEPARTMENT_MAP[id].label)).join(' / ')}</p><p><a href="${HOME}confirm.html#token=${encodeURIComponent(confirm)}">确认订阅 · Confirm subscription</a></p><p>如果不是你申请，请忽略此邮件。确认链接24小时内有效。<br>Ignore this email if you did not request it. Link expires in 24 hours.</p>`);
   await this.db.put('sub/'+id,{email,scopes,requestedAt:now,confirmedAt:null,unsubscribe:unsub});
   await this.db.put('token/'+await hash(confirm),{id,action:'/confirm',expires:now+86400000});
   await this.db.put('token/'+await hash(unsub),{id,action:'/unsubscribe',expires:now+3660*86400000});
   return response({message:'确认邮件已发送，请点击邮件里的链接完成订阅。'});
  }
  if(route.startsWith('/admin/')){
   checkAuth(req,this.env.ADMIN_TOKEN);
   if(route==='/admin/review-event'&&req.method==='POST'){
    const b=await req.json(),sku=String(b.sku||'');if(!/^\d{1,12}$/.test(sku))throw Error('Invalid review SKU');
    const p=await this.db.get('event/'+sku);if(!p)return response({error:'只能更新已有真实新品的已发布信息卡'},409);
    const r=await fetch(HOME+'mail-assets/'+sku+'/manifest.json'+(b.cardVersion?'?review='+encodeURIComponent(b.cardVersion):''),{signal:AbortSignal.timeout(10000)});if(!r.ok)return response({error:'核验后的信息卡尚未发布'},503);
    const m=await r.json();if(b.cardVersion&&m.cardVersion!==b.cardVersion)return response({error:'更正信息卡版本尚未发布，保留队列等待'},503);if(m.sku!==sku||m.sourceUrl!==p.sourceUrl||m.priceGBP!==p.priceGBP||!Array.isArray(m.colors)||!m.original?.sha256)throw Error('Reviewed manifest does not match observed SKU');
    mailAssets({...p,mailAssets:m});
    const version=await hash(JSON.stringify([m.colors,m.material,m.style,m.cardVersion,m.original.sha256]));
    const changed=JSON.stringify(p.colorValues)!==JSON.stringify(m.colors)||p.material!==m.material;
    if(changed)p.pendingReviewCorrection=version;
    Object.assign(p,{colorValues:m.colors,treeColor:m.colors.join(' / '),material:m.material,style:m.style,heightLabel:m.height,mailAssets:m});await this.db.put('event/'+sku,p);
    let correctionsSent=0;
    if(b.sendCorrection===true&&p.pendingReviewCorrection){
     const subs=await this.db.list({prefix:'sub/'});
     for(const [subKey,sub]of subs){
      const delivered='delivered/'+sku+'/'+subKey.slice(4),key='correction/'+sku+'/'+subKey.slice(4)+'/'+p.pendingReviewCorrection;
      if(!sub.confirmedAt||!accepts(sub,p)||!await this.db.get(delivered)||await this.db.get(key))continue;
      for(const asset of mailAssets(p)){const ready=await fetch(asset.url,{method:'HEAD',signal:AbortSignal.timeout(10000)});if(!ready.ok||!ready.headers.get('content-type')?.startsWith('image/'))return response({error:'更正附件尚未可访问，已保留恢复记录'},503);}
      const html='<p>商品数据更正 · Product data correction：已按同一SKU的官网原图和描述修正颜色或材质，请以本封附件为准。这不是再次上新的通知。<br>Use the corrected product card attached to this email. This is a correction, not a new discovery.</p>'+productMail(p,url.origin,false,url.origin+'/unsubscribe?token='+encodeURIComponent(sub.unsubscribe));
      const id=await this.send(sub.email,'【数据更正 · Correction】'+p.variantName,html,mailAssets(p),await hash(key));await this.db.put(key,{acceptedAt:new Date().toISOString(),providerId:id});correctionsSent++;
      if(correctionsSent>=8)return response({updated:true,correctionsSent,morePending:true});
     }
     delete p.pendingReviewCorrection;await this.db.put('event/'+sku,p);
    }
    return response({updated:true,changed,correctionsSent,firecrawlCredits:0});
   }
   if(route==='/admin/notification-status'&&req.method==='GET')return response({...await this.deliveryStatus(),pending:[...(await this.db.list({prefix:'pending/'})).values()].map(p=>({sku:p.sku,kind:p.kind,name:p.variantName,sourceUrl:p.sourceUrl,priceGBP:p.priceGBP,variantImageUrl:p.variantImageUrl,firstDetectedAt:p.firstDetectedAt,unavailableSince:p.unavailableSince||null}))});
   if(route==='/admin/defer-unavailable'&&req.method==='POST'){
    const b=await req.json();if(!Array.isArray(b.skus)||b.skus.length>100||!Number.isFinite(Date.parse(b.observedAt)))throw Error('Invalid source availability review');
    for(const sku of b.skus){const p=await this.db.get('pending/'+sku);if(p)await this.db.put('pending/'+sku,{...p,unavailableSince:b.observedAt});}
    const pending=[...(await this.db.list({prefix:'pending/'})).values()],m=await this.monitorState();if(!pending.some(p=>!p.unavailableSince)){await this.db.put('monitor',{...m,state:(await this.deliveryStatus()).pendingDeliveries?'delivery-pending':'active',lastError:null,lastSuccess:m.checkedAt});}return response({deferredUnavailable:b.skus.length,firecrawlCredits:0});
   }
   if(['/admin/recover-event','/admin/deliver'].includes(route)&&req.method==='POST')return this.route(new Request(url.origin+route.replace('/admin/','/internal/'),{method:'POST',headers:{authorization:'Bearer '+this.env.CONTROL_TOKEN,'content-type':'application/json'},body:await req.text()}));
   if(route==='/admin/test-email'&&req.method==='POST')return this.route(new Request(url.origin+'/internal/test-email',{method:'POST',headers:{authorization:'Bearer '+this.env.CONTROL_TOKEN,'content-type':'application/json'},body:await req.text()}));
   if(route==='/admin/subscription-scopes'&&req.method==='POST'){
    const b=await req.json(),email=String(b.email||'').toLowerCase().trim(),id=await hash(email),sub=await this.db.get('sub/'+id);
    if(!sub?.confirmedAt)return response({error:'邮箱尚未确认订阅'},409);
    const scopes=allowedScopes.filter(s=>(b.scopes||[]).includes(s));if(!scopes.length)throw Error('Invalid subscription scope');sub.scopes=scopes;await this.db.put('sub/'+id,sub);return response({updated:true,scopes});
   }
   if(route==='/admin/schedule'&&req.method==='POST'){
    const body=await req.json(),config={...firstRun(body),revision:token(),effectiveAt:new Date().toISOString()};await this.db.put('config',config);return response({config,message:'云端计划已保存，下一次起按新周期执行。'});
   }
  }
  if(route.startsWith('/internal/')){
   checkAuth(req,this.env.CONTROL_TOKEN);
   if(route==='/internal/clock-tick'&&req.method==='POST')return response(await dispatchDue({storage:this.db,env:this.env,config:await this.config(),monitor:{...await this.monitorState(),...await this.deliveryStatus()},fullLease:await this.db.get('lease/full'),monitorLease:await this.db.get('lease/monitor'),initialized:Boolean(await this.db.get('seeded'))}));
   if(route==='/internal/test-email'&&req.method==='POST'){
    const b=await req.json(),email=String(b.email||'').trim().toLowerCase(),sub=validEmail(email)&&await this.db.get('sub/'+await hash(email));
    if(!sub?.confirmedAt)return response({error:'测试邮箱尚未确认订阅'},409);
    const p=b.product;if(!/^\d{1,12}$/.test(String(p?.sku))||p.newStatus!==true)throw Error('测试商品必须有真实NEW证据');verifyUrl(p.sourceUrl,['therange.co.uk']);
    const assets=mailAssets(p),key=String(b.requestId||'');if(!/^[A-Za-z0-9_-]{4,100}$/.test(key))throw Error('Invalid test request');const prior=await this.db.get('test/'+key);if(prior)return response({accepted:true,alreadySent:true});
    const messageId=await this.send(email,'【测试】邮箱直接保存图片｜'+p.variantName,productMail(p,url.origin,true),assets,await hash('test/'+key));await this.db.put('test/'+key,{messageId,at:new Date().toISOString()});return response({accepted:true,messageId});
   }
   if(route==='/internal/mail-status'&&req.method==='GET'){
    const subs=[...(await this.db.list({prefix:'sub/'})).values()];return response({...await this.deliveryStatus(),confirmedSubscriptions:subs.filter(s=>s.confirmedAt).length,pendingSubscriptions:subs.filter(s=>!s.confirmedAt).length,pendingScreenshots:(await this.db.list({prefix:'pending/'})).size});
   }
   if(route==='/internal/seed'&&req.method==='POST'){
    if(await this.db.get('seeded'))return response({seeded:true,changed:false});
    const b=await req.json();if(!Array.isArray(b.records)||b.records.length>10000)throw Error('Invalid baseline');
    const values={config:b.config?{...firstRun(),...b.config}:firstRun()};
    for(const p of b.records){if(!/^\d{1,12}$/.test(String(p.sku)))throw Error('Invalid SKU');if(p.everNew)values['seen/'+p.sku]=true}
    // Only the first authenticated seed may migrate subscriptions with existing consent.
    const subscriptions=b.confirmedSubscriptions||[];if(!Array.isArray(subscriptions)||subscriptions.length>10000)throw Error('Invalid subscription migration');
    for(const sub of subscriptions){const email=String(sub.email||'').trim().toLowerCase(),confirmed=Date.parse(sub.confirmedAt),scopes=allowedScopes.filter(kind=>(sub.scopes||[]).includes(kind));if(!validEmail(email)||!Number.isFinite(confirmed)||confirmed>Date.now()||!scopes.length)throw Error('Unverified subscription migration');const id=await hash(email),unsubscribe=token();values['sub/'+id]={email,scopes,requestedAt:confirmed,confirmedAt:new Date(confirmed).toISOString(),unsubscribe};values['token/'+await hash(unsubscribe)]={id,action:'/unsubscribe',expires:Date.now()+3660*86400000};}
    const entries=Object.entries(values);for(let i=0;i<entries.length;i+=100)await this.db.put(Object.fromEntries(entries.slice(i,i+100)));await this.db.put('seeded',new Date().toISOString());return response({seeded:true,changed:true});
   }
   if(route==='/internal/extend-baseline'&&req.method==='POST'){
    const b=await req.json();if(!['christmas-decorations-v1','christmas-lights-v1'].includes(b.scope)||!Array.isArray(b.records)||b.records.length>30000)throw Error('Invalid scoped baseline');
    if(await this.db.get('baseline/'+b.scope))return response({seeded:true,changed:false});
    const records=b.records;if(records.some(p=>!/^\d{1,12}$/.test(String(p.sku))))throw Error('Invalid baseline SKU');
    for(const p of records)if(p.everNew&&!await this.db.get('pending/'+p.sku)&&!await this.db.get('event/'+p.sku))await this.db.put('seen/'+p.sku,true);
    await this.db.put('baseline/'+b.scope,{observedAt:b.observedAt,products:records.length});return response({seeded:true,changed:true,products:records.length});
   }
   if(route==='/internal/claim'&&req.method==='POST'){
    const options=await req.json(),config=await this.config(),monitorState=await this.monitorState(),now=Date.now(),lease=token(),initialized=await this.db.get('seeded');
    let full=false,monitor=false;
    await this.db.transaction(async db=>{
     const f=await db.get('lease/full');if(now>=Date.parse(config.nextRunAt)&&(!f||f.expires<now)){full=true;await db.put('lease/full',{lease,expires:now+7*3600000,revision:config.revision||null,due:config.nextRunAt})}
     const m=await db.get('lease/monitor');
     if(initialized&&this.env.BREVO_API_KEY&&(!m||m.expires<now)&&(options.forceMonitor===true||now>=Date.parse(monitorState.nextRunAt))){monitor=true;await db.put('lease/monitor',{lease,expires:now+100*60000})}
    });
    return response({config,full,monitor,lease});
   }
   if(route==='/internal/full-complete'&&req.method==='POST'){
    const b=await req.json(),lease=await this.db.get('lease/full');if(lease?.lease!==b.lease)return response({error:'运行租约不匹配'},409);
    const c=await this.config();if(b.success&&(c.revision||null)===lease.revision)await this.db.put('config',advanceRun(c));
    await this.db.delete('lease/full');return response({config:await this.config()});
   }
   if(route==='/internal/monitor-plan'&&req.method==='POST'){
    const b=await req.json(),lease=await this.db.get('lease/monitor');if(lease?.lease!==b.lease)return response({error:'监测租约不匹配'},409);
    if(!Array.isArray(b.products)||b.products.length>30000)throw Error('Invalid scan');
    for(const p of b.products){if(!/^\d{1,12}$/.test(p.sku))throw Error('Invalid SKU');verifyUrl(p.sourceUrl,['therange.co.uk']);if(p.newStatus&&!await this.db.get('seen/'+p.sku)){const pending=await this.db.get('pending/'+p.sku);if(!pending)await this.db.put('pending/'+p.sku,{...p,firstDetectedAt:new Date().toISOString()});else if(pending.unavailableSince){delete pending.unavailableSince;await this.db.put('pending/'+p.sku,pending);}}}
    return response({candidates:[...(await this.db.list({prefix:'pending/'})).values()]});
   }
   if(['/internal/event','/internal/recover-event'].includes(route)&&req.method==='POST'){
    const b=await req.json(),lease=await this.db.get('lease/monitor');if(route==='/internal/event'&&lease?.lease!==b.lease)return response({error:'监测租约不匹配'},409);
    const p=b.product;if(!/^\d{1,12}$/.test(p?.sku))throw Error('Invalid SKU');verifyUrl(p.sourceUrl,['therange.co.uk']);
    if(await this.db.get('seen/'+p.sku))return response({alreadyRecorded:true});
    if(route==='/internal/recover-event'){
     const pending=await this.db.get('pending/'+p.sku);
     if(!pending||p.newStatus!==true||p.sourceUrl!==pending.sourceUrl||p.detailEvidence?.selectedSku!==p.sku||!p.detailEvidence?.verifiedProductSection||!p.mailAssets?.proof?.url)return response({error:'只能恢复已有待处理且证据完整的真实新品'},409);
     mailAssets(p);
    }
    if(!b.screenshotBase64||b.screenshotBase64.length>7000000||!/^[A-Za-z0-9+/=]+$/.test(b.screenshotBase64))return response({error:'原站截图尚未取得，等待重试；不会用主图冒充截图。'},422);
    const pending=await this.db.get('pending/'+p.sku),parts=b.screenshotBase64.match(/.{1,60000}/g),imageAccess=await hash(token()),record={...p,imageAccess,screenshotParts:parts.length,detectedAt:pending?.firstDetectedAt||new Date().toISOString(),screenshotVerifiedAt:b.screenshotVerifiedAt};
    const values={};parts.forEach((part,i)=>values['shot/'+p.sku+'/'+i]=part);const entries=Object.entries(values);for(let i=0;i<entries.length;i+=100)await this.db.put(Object.fromEntries(entries.slice(i,i+100)));await this.db.put({['event/'+p.sku]:record,['seen/'+p.sku]:true,['image-access/'+imageAccess]:p.sku});
    await this.db.delete('pending/'+p.sku);const recent=await this.db.get('recent')||[];recent.unshift({sku:p.sku,name:p.variantName,kind:p.kind,imageUrl:p.variantImageUrl||p.imageUrl,sourceUrl:p.sourceUrl,priceGBP:p.priceGBP,detectedAt:record.detectedAt});await this.db.put('recent',recent.slice(0,30));
    return response({recorded:true});
   }
   if(route==='/internal/monitor-complete'&&req.method==='POST'){
    const b=await req.json(),lease=await this.db.get('lease/monitor');if(lease?.lease!==b.lease)return response({error:'监测租约不匹配'},409);
    const previous=await this.monitorState();
    for(const sku of b.unavailableSkus||[]){const p=await this.db.get('pending/'+sku);if(p)await this.db.put('pending/'+sku,{...p,unavailableSince:new Date().toISOString()});}
    const delivery=await this.deliveryStatus();await this.db.put('monitor',{...previous,...delivery,state:b.success?(delivery.pendingDeliveries?'delivery-pending':'active'):'error',nextRunAt:advanceNewCheck(previous.nextRunAt),checkedAt:new Date().toISOString(),lastSuccess:b.success?new Date().toISOString():previous.lastSuccess||null,lastError:b.success?null:String(b.error||'源站检查未完成').slice(0,200),scanned:b.scanned||0,newCount:b.newCount||0});await this.db.delete('lease/monitor');return response({saved:true});
   }
   if(route==='/internal/deliver'&&req.method==='POST'){
    const events=await this.db.list({prefix:'event/'}),subs=await this.db.list({prefix:'sub/'});let accepted=0;
    for(const [eventKey,p] of events){
     const created=Date.parse(p.detectedAt);if(Date.now()-created>14*86400000){await this.db.delete(eventKey);await this.db.delete('image-access/'+p.imageAccess);for(let i=0;i<p.screenshotParts;i++)await this.db.delete('shot/'+p.sku+'/'+i);continue}
     const needsDelivery=await Promise.all([...subs].map(async([key,sub])=>sub.confirmedAt&&Date.parse(sub.confirmedAt)<=created&&accepts(sub,p)&&!await this.db.get('delivered/'+p.sku+'/'+key.slice(4))));
     if(!needsDelivery.some(Boolean))continue;
     // Publication can include a local image review after queueing. Keep the
     // body and the native attachments aligned without reading the retailer.
     if(p.mailAssets?.cardVersion&&p.mailAssets.original?.sha256){
      const r=await fetch(HOME+'mail-assets/'+p.sku+'/manifest.json',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Object.assign(Error('新品信息卡尚未发布，保留队列等待投递。'),{status:503});
      const m=await r.json();if(m.sku!==p.sku||m.sourceUrl!==p.sourceUrl||m.priceGBP!==p.priceGBP||m.original?.sha256!==p.mailAssets.original.sha256)throw Object.assign(Error('已发布附件与核验SKU不一致，已保留队列。'),{status:503});
      mailAssets({...p,mailAssets:m});Object.assign(p,{mailAssets:m,colorValues:m.colors,treeColor:(m.colors||[]).join(' / '),material:m.material,style:m.style,heightLabel:m.height});await this.db.put(eventKey,p);
     }
     let content;
     for(const [subKey,sub] of subs){
      if(!sub.confirmedAt||Date.parse(sub.confirmedAt)>created||!accepts(sub,p))continue;
      const delivered='delivered/'+p.sku+'/'+subKey.slice(4);if(await this.db.get(delivered))continue;
      if(!content){const chunks=[];for(let i=0;i<p.screenshotParts;i++)chunks.push(await this.db.get('shot/'+p.sku+'/'+i));content=chunks.join('')}
      const unsubscribe=url.origin+'/unsubscribe?token='+encodeURIComponent(sub.unsubscribe);
      const html=productMail(p,url.origin,false,unsubscribe);
      if(p.mailAssets?.card&&p.mailAssets?.original)for(const asset of mailAssets(p)){
       const ready=await fetch(asset.url,{method:'HEAD',signal:AbortSignal.timeout(10000)});
       if(!ready.ok||!ready.headers.get('content-type')?.startsWith('image/'))throw Object.assign(Error('新品高清附件尚未发布；待发记录已保留，将仅重试投递。'),{status:503,assetStatus:ready.status,assetName:asset.name,assetContentType:ready.headers.get('content-type')});
      }
      const id=await this.send(sub.email,'NEW｜'+p.variantName,html,(p.mailAssets?.card&&p.mailAssets?.original)?mailAssets(p):[{name:'NEW-'+p.sku+'.png',content}],await hash(p.sku+'/'+subKey));
      // Manifest + three attachment HEADs + one Brevo call. Eight messages
      // leave room below the free Worker's 50 external-subrequest limit.
      await this.db.put(delivered,{acceptedAt:new Date().toISOString(),providerId:id});accepted++;if(accepted>=8)return response({accepted,morePending:true});
     }
    }
    const delivery={accepted,at:new Date().toISOString()};if(accepted)await this.db.put('last-delivery',delivery);
    const status=await this.deliveryStatus(),monitor=await this.monitorState();
    if(!status.pendingDeliveries&&(accepted||monitor.state==='delivery-pending'||monitor.state==='not-started'&&status.lastDelivery))await this.db.put('monitor',{...monitor,state:'active',lastDelivery:accepted?delivery:status.lastDelivery,pendingDeliveries:0,nextRunAt:Date.parse(monitor.nextRunAt)<=Date.now()?nextNewCheck():monitor.nextRunAt});
    return response({accepted,morePending:false,...status});
   }
  }
  return response({error:'Not found'},404);
 }
}
export default {async fetch(req,env){
 const origin=req.headers.get('origin'),target=new URL(req.url),sameOriginForm=origin===target.origin&&['/confirm','/unsubscribe'].includes(target.pathname);if(origin&&origin!==SITE&&!sameOriginForm)return response({error:'Origin not allowed'},403);
 const headers={'access-control-allow-origin':SITE,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','vary':'Origin','cache-control':'no-store','x-content-type-options':'nosniff'};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const size=Number(req.headers.get('content-length')||0);if(size>8000000)return response({error:'Request too large'},413);
 const result=await env.CONTROL.getByName('main').fetch(req),out=new Response(result.body,result);for(const[k,v]of Object.entries(headers))out.headers.set(k,v);return out;
},async scheduled(event,env,ctx){
 const request=new Request('https://range-control.internal/internal/clock-tick',{method:'POST',headers:{authorization:'Bearer '+env.CONTROL_TOKEN,'content-type':'application/json'},body:'{}'});
 ctx.waitUntil(env.CONTROL.getByName('main').fetch(request).then(r=>{if(!r.ok)throw Error('Scheduled control request failed HTTP '+r.status)}));
}};
