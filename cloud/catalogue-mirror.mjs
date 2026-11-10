const PREFIX='/observatory/';
export const FALLBACK_CATALOGUE_REVISION='099611f3b9fc57cd76a6e7fbd2ab7d0d4499e427';
const ROOT='https://raw.githubusercontent.com/g-jayden/range-christmas-observatory/';
const rootFiles=new Set(['index.html','confirm.html','product.html','image-check.html','dashboard-full.css','dashboard-full.js','dashboard-navigation.js','controls.js','image-check.js','catalogue-model.mjs','catalogue-navigation.mjs','asda-model.mjs','ms-model.mjs','bm-model.mjs','retailers.mjs','theme-model.mjs','taxonomy.mjs','product-preview.mjs','product-preview-dialog.js','monitor-labels.mjs','catalogue.json','status.json','settings.json','service.json','collection-policy.json','collection-ledger.json','collection-diagnostics.json','monitor-state.json','new-arrivals.json','monitor-proof.json','product-evidence-health.json','product-evidence-repair.json','preview-status.json','taxonomy-status.json','taxonomy-audit.json','decorations.json','decorations-status.json','lights.json','lights-status.json','themes.json','themes-status.json','notification-readiness.json']);
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8'};
export async function catalogueMirror(req,{getRevision,fetcher=fetch}){
 const u=new URL(req.url);if(u.pathname!=='/observatory'&&!u.pathname.startsWith(PREFIX))return null;
 if(!['GET','HEAD'].includes(req.method))return new Response('Method not allowed',{status:405});
 if(u.pathname==='/observatory'||u.pathname===PREFIX){const r=await getRevision(),sha=/^[a-f0-9]{40}$/.test(r?.commit||'')?r.commit:FALLBACK_CATALOGUE_REVISION;return Response.redirect(u.origin+PREFIX+'r/'+sha+'/'+u.search,302);}
 const m=u.pathname.match(/^\/observatory\/r\/([a-f0-9]{40})\/(.*)$/);if(!m)return new Response('Not found',{status:404});
 const [,sha,tail]=m,file=tail||'index.html';if(!/^[A-Za-z0-9_.\/-]+$/.test(file)||file.split('/').some(p=>p==='..'||p==='.'||!p))return new Response('Not found',{status:404});
 const image=/^images\/[\w/-]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(file),nested=/^(?:classified|decoration-details|light-details|theme-details)\/[\w-]+\.json$/.test(file)||/^(?:asda|ms|bm)\/(?:catalogue|status|reviews)\.json$/.test(file)||/^mail-assets\/(?:(?:asda|ms|bm)-)?\d+\/(?:manifest\.json|[\w-]+\.(?:png|jpg|jpeg|webp))$/.test(file);
 if(!rootFiles.has(file)&&!nested&&!image)return new Response('Not found',{status:404});
 const source=ROOT+sha+'/web/'+file;if(image||/^mail-assets\/.*\.(?:png|jpg|jpeg|webp)$/.test(file))return Response.redirect(source,302);
 let r;try{r=await fetcher(source,{method:req.method,redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{return new Response('Published file temporarily unavailable',{status:503,headers:{'retry-after':'30'}});}if(!r.ok)return new Response('Published file unavailable',{status:r.status===404?404:502});
 const ext=file.split('.').pop(),headers={'content-type':types[ext]||'application/octet-stream','cache-control':ext==='html'?'no-store':'public, max-age=31536000, immutable','x-content-type-options':'nosniff','x-catalogue-revision':sha};
 if(file!=='index.html'||req.method==='HEAD')return new Response(r.body,{headers});
 const refresh=`<script>setInterval(()=>fetch('/public/published-site',{cache:'no-store'}).then(r=>r.json()).then(r=>{if(/^[a-f0-9]{40}$/.test(r.commit||'')&&r.commit!==${JSON.stringify(sha)})location.replace('/observatory/r/'+r.commit+'/'+location.search+location.hash)}).catch(()=>{}),60000)</script>`;
 return new Response((await r.text()).replace('</body>',refresh+'</body>'),{headers});
}
