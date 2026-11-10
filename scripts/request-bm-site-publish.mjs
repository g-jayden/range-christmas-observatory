import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Queue the existing source-free publisher after B&M data are committed.
// The repository's short-lived workflow token stays inside GitHub Actions.
export async function requestBmSitePublish({env=process.env,fetcher=fetch}={}){
 if(env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!env.GITHUB_TOKEN)throw Error('B&M publication requires its GitHub Actions identity');
 const r=await fetcher('https://api.github.com/repos/'+env.GITHUB_REPOSITORY+'/actions/workflows/daily-pages.yml/dispatches',{method:'POST',headers:{authorization:'Bearer '+env.GITHUB_TOKEN,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28'},body:JSON.stringify({ref:'main',inputs:{refresh:false,mode:'publish',checkNew:false,runner:'ubuntu-latest',browser:'firecrawl-browser'}}),signal:AbortSignal.timeout(20000)});
 if(r.status!==204)throw Error('B&M website publication request HTTP '+r.status);
 return {requested:true,mode:'publish',sourceRefresh:false,firecrawlCredits:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();console.log(JSON.stringify({phase:'B&M canonical website publication',commit,...await requestBmSitePublish()}));}
