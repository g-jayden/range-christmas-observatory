import fs from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';import{copyStaticFrontendAssets}from'../server/static-front-end-assets.mjs';
const root=process.argv[2]||'public',source=process.argv[3]||'web',digest=s=>createHash('sha256').update(s).digest('hex').slice(0,12);
await copyStaticFrontendAssets(source,root,{modulesOnly:true});
const files=(await fs.readdir(root)).filter(f=>/\.(?:mjs|js)$/.test(f)),sources=new Map(await Promise.all(files.map(async f=>[f,await fs.readFile(path.join(root,f),'utf8')]))),hashes=new Map();
function hash(file,parents=new Set()){if(hashes.has(file))return hashes.get(file);if(parents.has(file))return '';const next=new Set([...parents,file]),text=sources.get(file)||'',dependencies=[...text.matchAll(/['"]\.\/([^'"]+\.(?:mjs|js))(?:\?v=[a-f0-9]+)?['"]/g)].map(m=>m[1]).filter(d=>sources.has(d)),h=digest(text+dependencies.map(d=>hash(d,next)).join(''));hashes.set(file,h);return h;}
for(const[file,text]of sources)await fs.writeFile(path.join(root,file),text.replace(/(['"])(\.\/([^'"]+\.(?:mjs|js)))(?:\?v=[a-f0-9]+)?\1/g,(all,q,relative,dependency)=>sources.has(dependency)?q+relative+'?v='+hash(dependency)+q:all));
const actualHashes=new Map(await Promise.all(files.map(async file=>[file,digest(await fs.readFile(path.join(root,file)))])));
for(const page of ['index.html','image-check.html','product.html','confirm.html']){let html;try{html=await fs.readFile(path.join(root,page),'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
 html=html.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/g,'');
 html=html.replace(/((?:src|href)=["'])([a-zA-Z0-9_./-]+\.(?:mjs|js))(?:\?[^"']*)?(["'])/g,(all,start,file,end)=>sources.has(file)?start+file+'?v='+actualHashes.get(file)+end:all);
 const seen=new Set,preloads=[];async function visit(url){const file=url.split('?')[0].replace(/^\.\//,'');if(seen.has(file))return;seen.add(file);if(!sources.has(file))throw Error('Published browser entry missing: '+file);const text=await fs.readFile(path.join(root,file),'utf8');preloads.push(url.replace(/^\.\//,''));for(const m of text.matchAll(/['"]\.\/([^'"]+\.(?:mjs|js)(?:\?v=[a-f0-9]+)?)['"]/g))await visit(m[1]);}
 for(const m of html.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g))await visit(m[1]);html=html.replace('</head>',preloads.map(url=>'<link rel="modulepreload" href="'+url+'">').join('')+'</head>');await fs.writeFile(path.join(root,page),html);
}
console.log(JSON.stringify({phase:'complete-browser-module-repair',browserModules:files.length,sourceRequests:0,firecrawlCredits:0,catalogueImageAndPdfFilesChanged:false}));

