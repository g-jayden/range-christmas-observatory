import path from 'node:path';
let engine;
export async function loadLocalVisualClassifier({runtime,delay=ms=>new Promise(r=>setTimeout(r,ms)),cacheDir=path.resolve('runtime/models')}={}){
 const {pipeline,env}=runtime||await import('@huggingface/transformers');env.cacheDir=cacheDir;
 for(let attempt=1;attempt<=3;attempt++)try{return await pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{dtype:'q8',device:'cpu'});}catch(e){if(attempt===3||!/gateway|fetch|network|timed? ?out|HTTP (?:408|429|5\d\d)|\b50[234]\b|could not locate/i.test(String(e.message)))throw e;console.log(JSON.stringify({phase:'local-model-transient-retry',attempt,sourceRequests:0,firecrawlCredits:0}));await delay(attempt*1500);}
}
export function localVisualClassifier(){if(!engine)engine=loadLocalVisualClassifier().catch(e=>{engine=null;throw e;});return engine;}
