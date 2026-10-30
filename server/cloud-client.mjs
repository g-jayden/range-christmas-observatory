export const apiBase=(process.env.CONTROL_API_URL||'').replace(/\/$/,'');
export async function control(route,body){
 if(!apiBase||!process.env.CONTROL_TOKEN)throw Error('Cloud control service is not configured');
 const r=await fetch(apiBase+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+process.env.CONTROL_TOKEN,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const result=await r.json();if(!r.ok)throw Error(result.error||'Cloud service HTTP '+r.status);return result;
}
