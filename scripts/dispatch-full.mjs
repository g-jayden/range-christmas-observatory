import fs from 'node:fs/promises';
const tick=JSON.parse(await fs.readFile('runtime/tick.json','utf8'));if(!tick.full)process.exit(0);
const r=await fetch('https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/actions/workflows/daily-pages.yml/dispatches',{method:'POST',headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{refresh:true,mode:'verify-all'}})});
if(!r.ok)throw Error('Full refresh could not be queued: HTTP '+r.status);console.log('Full refresh queued for the configured schedule.');
