import {firstRun,advanceRun,scheduleLabel,nextNewCheck,advanceNewCheck} from '../server/schedule.mjs';
const SITE='https://g-jayden.github.io';
const HOME=SITE+'/range-christmas-observatory/';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const validEmail=s=>typeof s==='string'&&s.length<=254&&/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(s);
function response(value,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store'}})}
function checkAuth(req,secret){if(!secret||req.headers.get('authorization')!=='Bearer '+secret)throw Object.assign(Error('无权执行此操作。'),{status:401});}
function verifyUrl(raw,hosts){const u=new URL(raw);if(u.protocol!=='https:'||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('非允许的来源地址。');return u.href;}
function mailAssets(p){
 const m=p.mailAssets;if(!m?.card?.url||!m?.original?.url)throw Error('完整信息卡或官网原图尚未生成');
 const allowed=raw=>{const u=new URL(raw);if(u.origin!==SITE||!u.pathname.startsWith('/range-christmas-observatory/mail-assets/'+p.sku+'/'))throw Error('Invalid generated mail asset');return u.href;};
 return [{name:'NEW-'+p.sku+'-完整信息卡.png',url:allowed(m.card.url)},{name:'NEW-'+p.sku+'-官网原图.'+new URL(m.original.url).pathname.split('.').pop(),url:allowed(m.original.url)},...(m.proof?.url?[{name:'NEW-'+p.sku+'-原站商品页.png',url:allowed(m.proof.url)}]:[])];
}
function productMail(p,origin,test=false,unsubscribe=null){
 const m=p.mailAssets,has=m?.card?.url&&m?.original?.url; if(has)mailAssets(p);
 const checked=p.newEvidence?.observedAt||p.observedAt||p.detectedAt;
 const header=test?'测试示例 · 原站NEW标记，不代表今天首次上架':'NEW · '+(p.kind==='skirt'?'圣诞树裙':'圣诞树');
 return `<div style="font:16px/1.8 Arial,sans-serif;max-width:900px;margin:auto;color:#173c32"><p>${esc(header)}</p><h1>${esc(p.variantName)}</h1>${has?`<a href="${esc(m.original.url)}"><img src="${esc(m.original.url)}" alt="官网原始商品照片" style="width:100%;max-width:700px;height:auto"></a>`:`<img src="${origin}/shots/${p.imageAccess}" alt="具体SKU原站截图" style="width:100%;height:auto">`}<p>SKU：${esc(p.sku)}<br>价格：£${Number(p.priceGBP).toFixed(2)}${p.kind==='tree'?'<br>高度：'+esc(p.heightLabel||'未提供'):''}<br>本体颜色：${esc(p.treeColor||'待核验')}<br>${p.kind==='tree'?'分类：'+esc(p.style||'其它树形类别'):'材质：'+esc(p.material||'未提供')}</p><p><a href="${esc(p.sourceUrl)}">查看原站具体SKU购买页</a></p>${has?`<p><a href="${esc(m.card.url)}">保存完整信息卡PNG</a> · <a href="${esc(m.original.url)}">下载官网原图</a></p><p>原图 ${Number(m.original.width)}×${Number(m.original.height)} 像素，原文件未经放大或二次压缩。信息卡与原图也作为独立附件，可长期保存。</p>`:''}<p style="font-size:13px;color:#607168">价格与NEW核验时间：${esc(checked)}；下单时以官网为准。${test?'本测试不改变新品去重基线。':''}</p>${unsubscribe?`<p><a href="${esc(unsubscribe)}">取消订阅</a> · <a href="${HOME}">查看分析网站</a></p>`:`<p><a href="${HOME}">查看分析网站</a></p>`}</div>`;
}
export class Control{
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.db=ctx.storage;}
 async config(){return await this.db.get('config')||firstRun();}
 async monitorState(){
  const m=await this.db.get('monitor')||{};
  if(m.scheduleVersion!=='daily-0700-v1'){delete m.intervalMinutes;Object.assign(m,{scheduleVersion:'daily-0700-v1',schedule:'每天北京时间07:00检查，有新款才推送',time:'07:00',timezone:'Asia/Shanghai',nextRunAt:nextNewCheck(),state:m.lastSuccess?'active':'not-started'});await this.db.put('monitor',m)}
  return m;
 }
 async send(to,subject,html,attachments=[],idempotencyKey){
  if(!this.env.BREVO_API_KEY||!this.env.MAIL_FROM)throw Object.assign(Error('邮件服务尚未连接，尚未发送邮件。'),{status:503});
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':this.env.BREVO_API_KEY,'content-type':'application/json'},body:JSON.stringify({sender:{email:this.env.MAIL_FROM,name:'圣诞新品观察'},to:[{email:to}],subject,htmlContent:html,...(idempotencyKey?{headers:{idempotencyKey}}:{}),...(attachments.length?{attachment:attachments}:{})}),signal:AbortSignal.timeout(20000)});
  if(!r.ok){let detail;try{detail=await r.json()}catch{}throw Object.assign(Error('邮件服务未接受邮件，请稍后重试。'),{status:502,providerStatus:r.status,providerCode:String(detail?.code||'unknown'),providerMessage:String(detail?.message||'').slice(0,500)});}
  return (await r.json()).messageId;
 }
 async fetch(req){
  try{return await this.route(req)}catch(e){return response({error:e.status?e.message:'操作未完成，请稍后重试。',...(new URL(req.url).pathname.startsWith('/internal/')&&e.providerStatus?{providerStatus:e.providerStatus,providerCode:e.providerCode,providerMessage:e.providerMessage}:{})},e.status||500)}
 }
 async route(req){
  const url=new URL(req.url),route=url.pathname;
  if(route==='/public/status'&&req.method==='GET'){
   const config=await this.config(),monitor=await this.monitorState();
   return response({config,schedule:scheduleLabel(config),baselineReady:Boolean(await this.db.get('seeded')),monitor:{...monitor,pendingScreenshots:(await this.db.list({prefix:'pending/'})).size},mailReady:Boolean(this.env.BREVO_API_KEY&&this.env.MAIL_FROM),recent:await this.db.get('recent')||[]});
  }
  if(route.startsWith('/shots/')&&req.method==='GET'){
   const access=route.slice(7);if(!/^[a-f\d]{64}$/.test(access))return response({error:'Not found'},404);
   const sku=await this.db.get('image-access/'+access),event=sku&&await this.db.get('event/'+sku);if(!event)return response({error:'Image expired; use email attachment'},404);
   const chunks=[];for(let i=0;i<event.screenshotParts;i++)chunks.push(await this.db.get('shot/'+sku+'/'+i));
   return new Response(Uint8Array.from(atob(chunks.join('')),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png','cache-control':'public,max-age=86400'}});
  }
  if(['/confirm','/unsubscribe'].includes(route)&&req.method==='GET'){
   const raw=url.searchParams.get('token')||'';if(raw.length>160)return response({error:'无效链接'},400);
   const label=route==='/confirm'?'确认订阅新品邮件':'确认取消新品邮件';
   return new Response(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label}</title><body style="font:18px/1.8 system-ui;padding:30px;max-width:650px;margin:auto"><h1>${label}</h1><p>圣诞树与树裙新品观察。邮件包含新品商品页截图和购买链接。</p><form method="post"><input type="hidden" name="token" value="${esc(raw)}"><button style="font:inherit;padding:12px">${label}</button></form><p><a href="${HOME}">返回产品分析网站</a></p></body></html>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
  }
  if(['/confirm','/unsubscribe'].includes(route)&&req.method==='POST'){
   const form=await req.formData(),key=await hash(String(form.get('token')||'')),record=await this.db.get('token/'+key);
   if(!record||record.action!==route||record.expires<Date.now())return response({error:'链接失效，请回网站重新申请。'},400);
   const sub=await this.db.get('sub/'+record.id);if(!sub)return response({error:'订阅不存在'},400);
   if(route==='/confirm'){sub.confirmedAt=new Date().toISOString();await this.db.put('sub/'+record.id,sub);await this.db.delete('token/'+key)}
   else{await this.db.delete('sub/'+record.id);await this.db.delete('token/'+key)}
   return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>${route==='/confirm'?'订阅已确认。只推送订阅后新发现的NEW，不补发已有基线商品。':'已取消订阅。'}</p><a href="${HOME}">返回网站</a>`,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
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
   const confirm=token(),unsub=token(),now=Date.now(),scopes=['tree','skirt'].filter(x=>(body.scopes||['tree','skirt']).includes(x));if(!scopes.length)return response({error:'至少选择一个产品范围。'},400);
   await this.send(email,'请确认：圣诞新品邮件订阅',`<h2>确认接收圣诞新品</h2><p>发现新的NEW商品后，我们会发送原站商品页截图与具体SKU购买链接。</p><p><a href="${HOME}confirm.html#token=${encodeURIComponent(confirm)}">确认订阅</a></p><p>如果不是你申请，请忽略此邮件。确认链接24小时内有效。</p>`);
   await this.db.put('sub/'+id,{email,scopes,requestedAt:now,confirmedAt:null,unsubscribe:unsub});
   await this.db.put('token/'+await hash(confirm),{id,action:'/confirm',expires:now+86400000});
   await this.db.put('token/'+await hash(unsub),{id,action:'/unsubscribe',expires:now+3660*86400000});
   return response({message:'确认邮件已发送，请点击邮件里的链接完成订阅。'});
  }
  if(route.startsWith('/admin/')){
   checkAuth(req,this.env.ADMIN_TOKEN);
   if(route==='/admin/schedule'&&req.method==='POST'){
    const body=await req.json(),config={...firstRun(body),revision:token(),effectiveAt:new Date().toISOString()};await this.db.put('config',config);return response({config,message:'云端计划已保存，下一次起按新周期执行。'});
   }
  }
  if(route.startsWith('/internal/')){
   checkAuth(req,this.env.CONTROL_TOKEN);
   if(route==='/internal/test-email'&&req.method==='POST'){
    const b=await req.json(),email=String(b.email||'').trim().toLowerCase(),sub=validEmail(email)&&await this.db.get('sub/'+await hash(email));
    if(!sub?.confirmedAt)return response({error:'测试邮箱尚未确认订阅'},409);
    const p=b.product;if(!/^\d{1,12}$/.test(String(p?.sku))||p.newStatus!==true)throw Error('测试商品必须有真实NEW证据');verifyUrl(p.sourceUrl,['therange.co.uk']);
    const assets=mailAssets(p),key=String(b.requestId||'');if(!/^[A-Za-z0-9_-]{4,100}$/.test(key))throw Error('Invalid test request');const prior=await this.db.get('test/'+key);if(prior)return response({accepted:true,alreadySent:true});
    const messageId=await this.send(email,'【测试】NEW 商品信息与高清下载｜'+p.variantName,productMail(p,url.origin,true),assets,await hash('test/'+key));await this.db.put('test/'+key,{messageId,at:new Date().toISOString()});return response({accepted:true,messageId});
   }
   if(route==='/internal/mail-status'&&req.method==='GET'){
    const subs=[...(await this.db.list({prefix:'sub/'})).values()];return response({confirmedSubscriptions:subs.filter(s=>s.confirmedAt).length,pendingSubscriptions:subs.filter(s=>!s.confirmedAt).length,pendingScreenshots:(await this.db.list({prefix:'pending/'})).size});
   }
   if(route==='/internal/seed'&&req.method==='POST'){
    if(await this.db.get('seeded'))return response({seeded:true,changed:false});
    const b=await req.json();if(!Array.isArray(b.records)||b.records.length>10000)throw Error('Invalid baseline');
    const values={config:b.config?{...firstRun(),...b.config}:firstRun()};
    for(const p of b.records){if(!/^\d{1,12}$/.test(String(p.sku)))throw Error('Invalid SKU');if(p.everNew)values['seen/'+p.sku]=true}
    // Only the first authenticated seed may migrate subscriptions with existing consent.
    const subscriptions=b.confirmedSubscriptions||[];if(!Array.isArray(subscriptions)||subscriptions.length>10000)throw Error('Invalid subscription migration');
    for(const sub of subscriptions){const email=String(sub.email||'').trim().toLowerCase(),confirmed=Date.parse(sub.confirmedAt),scopes=['tree','skirt'].filter(kind=>(sub.scopes||[]).includes(kind));if(!validEmail(email)||!Number.isFinite(confirmed)||confirmed>Date.now()||!scopes.length)throw Error('Unverified subscription migration');const id=await hash(email),unsubscribe=token();values['sub/'+id]={email,scopes,requestedAt:confirmed,confirmedAt:new Date(confirmed).toISOString(),unsubscribe};values['token/'+await hash(unsubscribe)]={id,action:'/unsubscribe',expires:Date.now()+3660*86400000};}
    const entries=Object.entries(values);for(let i=0;i<entries.length;i+=100)await this.db.put(Object.fromEntries(entries.slice(i,i+100)));await this.db.put('seeded',new Date().toISOString());return response({seeded:true,changed:true});
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
    if(!Array.isArray(b.products)||b.products.length>10000)throw Error('Invalid scan');
    for(const p of b.products){if(!/^\d{1,12}$/.test(p.sku))throw Error('Invalid SKU');verifyUrl(p.sourceUrl,['therange.co.uk']);if(p.newStatus&&!await this.db.get('seen/'+p.sku)&&!await this.db.get('pending/'+p.sku))await this.db.put('pending/'+p.sku,{...p,firstDetectedAt:new Date().toISOString()})}
    return response({candidates:[...(await this.db.list({prefix:'pending/'})).values()]});
   }
   if(route==='/internal/event'&&req.method==='POST'){
    const b=await req.json(),lease=await this.db.get('lease/monitor');if(lease?.lease!==b.lease)return response({error:'监测租约不匹配'},409);
    const p=b.product;if(!/^\d{1,12}$/.test(p?.sku))throw Error('Invalid SKU');verifyUrl(p.sourceUrl,['therange.co.uk']);
    if(await this.db.get('seen/'+p.sku))return response({alreadyRecorded:true});
    if(!b.screenshotBase64||b.screenshotBase64.length>7000000||!/^[A-Za-z0-9+/=]+$/.test(b.screenshotBase64))return response({error:'原站截图尚未取得，等待重试；不会用主图冒充截图。'},422);
    const pending=await this.db.get('pending/'+p.sku),parts=b.screenshotBase64.match(/.{1,60000}/g),imageAccess=await hash(token()),record={...p,imageAccess,screenshotParts:parts.length,detectedAt:pending?.firstDetectedAt||new Date().toISOString(),screenshotVerifiedAt:b.screenshotVerifiedAt};
    const values={};parts.forEach((part,i)=>values['shot/'+p.sku+'/'+i]=part);const entries=Object.entries(values);for(let i=0;i<entries.length;i+=100)await this.db.put(Object.fromEntries(entries.slice(i,i+100)));await this.db.put({['event/'+p.sku]:record,['seen/'+p.sku]:true,['image-access/'+imageAccess]:p.sku});
    await this.db.delete('pending/'+p.sku);const recent=await this.db.get('recent')||[];recent.unshift({sku:p.sku,name:p.variantName,kind:p.kind,imageUrl:p.variantImageUrl||p.imageUrl,sourceUrl:p.sourceUrl,priceGBP:p.priceGBP,detectedAt:record.detectedAt});await this.db.put('recent',recent.slice(0,30));
    return response({recorded:true});
   }
   if(route==='/internal/monitor-complete'&&req.method==='POST'){
    const b=await req.json(),lease=await this.db.get('lease/monitor');if(lease?.lease!==b.lease)return response({error:'监测租约不匹配'},409);
    const previous=await this.monitorState();
    await this.db.put('monitor',{...previous,state:b.success?'active':'error',nextRunAt:advanceNewCheck(previous.nextRunAt),checkedAt:new Date().toISOString(),lastSuccess:b.success?new Date().toISOString():previous.lastSuccess||null,lastError:b.success?null:String(b.error||'源站检查未完成').slice(0,200),scanned:b.scanned||0,newCount:b.newCount||0});await this.db.delete('lease/monitor');return response({saved:true});
   }
   if(route==='/internal/deliver'&&req.method==='POST'){
    const events=await this.db.list({prefix:'event/'}),subs=await this.db.list({prefix:'sub/'});let accepted=0;
    for(const [eventKey,p] of events){
     const created=Date.parse(p.detectedAt);if(Date.now()-created>14*86400000){await this.db.delete(eventKey);await this.db.delete('image-access/'+p.imageAccess);for(let i=0;i<p.screenshotParts;i++)await this.db.delete('shot/'+p.sku+'/'+i);continue}
     let content;
     for(const [subKey,sub] of subs){
      if(!sub.confirmedAt||Date.parse(sub.confirmedAt)>created||!sub.scopes.includes(p.kind))continue;
      const delivered='delivered/'+p.sku+'/'+subKey.slice(4);if(await this.db.get(delivered))continue;
      if(!content){const chunks=[];for(let i=0;i<p.screenshotParts;i++)chunks.push(await this.db.get('shot/'+p.sku+'/'+i));content=chunks.join('')}
      const unsubscribe=url.origin+'/unsubscribe?token='+encodeURIComponent(sub.unsubscribe);
      const html=productMail(p,url.origin,false,unsubscribe);
      const id=await this.send(sub.email,'NEW｜'+p.variantName,html,(p.mailAssets?.card&&p.mailAssets?.original)?mailAssets(p):[{name:'NEW-'+p.sku+'.png',content}],await hash(p.sku+'/'+subKey));
      await this.db.put(delivered,{acceptedAt:new Date().toISOString(),providerId:id});accepted++;if(accepted>=20)return response({accepted,morePending:true});
     }
    }
    return response({accepted,morePending:false});
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
}};
