// Directory reads share the existing exact-URL batched transport. Only merges
// wait for earlier scopes, so shared product facts and NEW history still flow
// trees/decorations -> lights -> themes without serialising source requests.
export async function collectDailyRangeScopes({recoveryOnly=false,previous,previousDecorations,previousLights,previousThemes,collectTrees,collectDecorations,collectLights,collectThemes}={}){
 if(recoveryOnly)return{gathered:{snapshot:structuredClone(previous)},decorations:previousDecorations.baselineReady?previousDecorations:null,lights:previousLights.baselineReady?previousLights:null,themes:previousThemes.baselineReady?previousThemes:null};
 const trees=Promise.resolve().then(collectTrees),decorations=Promise.resolve().then(collectDecorations);
 const lights=Promise.resolve().then(()=>collectLights(async()=>[(await trees).snapshot,await decorations]));
 const themes=Promise.resolve().then(()=>collectThemes(async()=>[(await trees).snapshot,await decorations,await lights]));
 // Preserve responses/checkpoints from every in-flight action before closing
 // the provider on failure. A first rejected scope cannot abandon paid work.
 const settled=await Promise.allSettled([trees,decorations,lights,themes]),failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;
 const values=settled.map(r=>r.value);return{gathered:values[0],decorations:values[1],lights:values[2],themes:values[3]};
}
