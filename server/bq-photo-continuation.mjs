export function bqPhotoContinuation(progress,status,closed,previous,run,{now=Date.now()}={}){
 const at=Date.parse(progress?.checkedAt),start=Date.parse(run?.created_at),end=Date.parse(run?.updated_at),source=Date.parse(progress?.sourceObservedAt),day=new Date(now+28800000).toISOString().slice(0,10),cutoff=Date.parse(day+'T06:00:00+08:00');
 if(run?.conclusion!=='failure'||!Number.isSafeInteger(run?.id)||progress?.paused!==true||!Number.isFinite(at)||!Number.isFinite(start)||!Number.isFinite(end)||end<start||at<start||at>end+60000||at>now+60000)return null;
 if(!Number.isFinite(source)||source<cutoff||source>now||status?.complete!==true||status.observedAt!==progress.sourceObservedAt||closed?.complete!==true||closed.observedAt!==progress.sourceObservedAt||closed.categories?.length!==10||closed.categories.some(c=>!c.complete||!c.closingVerified||c.unique!==c.declared))return null;
 const done=progress.previewCompleted,total=progress.products;
 if(!Number.isSafeInteger(done)||!Number.isSafeInteger(total)||done<=0||done>=total||status.skus!==total)return null;
 if(previous?.sourceObservedAt===progress.sourceObservedAt&&(previous.previewCompleted>=done||previous.producerRunId===run.id))return null;
 return{sourceObservedAt:progress.sourceObservedAt,previewCompleted:done,products:total,producerRunId:run.id,requestedAt:new Date(now).toISOString(),mode:'reuse-exact-saved-source-and-reviewed-photos',sourceRequests:0,firecrawlCredits:0};
}
