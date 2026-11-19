// Free runtime/navigation failures must reach the authorised paid collector,
// while a saved-data rebuild must never start any source transport.
export async function collectJlSource({rebuilding=false,resumePaid=false,paidEnabled=false,readSaved,collectFree,collectPaid}){
 if(rebuilding)return readSaved();
 if(resumePaid)return collectPaid();
 let free;
 try{free=await collectFree();}catch(e){free={complete:false,observedAt:new Date().toISOString(),categories:[],families:{},firecrawlCredits:0,sourceRequests:0,failures:[{phase:'free-runtime-or-transport',error:String(e.message).slice(0,500)}]};}
 if(free.complete||!paidEnabled)return free;
 return {...await collectPaid(),freeTransportFailures:free.failures};
}
