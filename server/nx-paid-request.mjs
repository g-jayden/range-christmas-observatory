import {NEXT_DIRECTORIES} from '../web/nx-model.mjs';

// Request preparation only. This module does not perform network calls.
// A new explicit, bounded user approval is required before a caller submits it.
export function buildNextSourceRequest(){
 const paths=NEXT_DIRECTORIES.map(d=>d[1]);
 const action=async paths=>{
  const origin='https://www.next.co.uk',results=[];
  for(const path of paths){const r=await fetch(origin+path,{signal:AbortSignal.timeout(18000)});const html=await r.text();results.push({path,status:r.status,html:r.status===200?html:null});if([401,403,429].includes(r.status))return {directories:results,clientSource:null,blocked:true};}
  const script=[...document.querySelectorAll('script[src]')].map(s=>s.src).find(url=>url.startsWith(origin+'/static-content/plp/js/main.'));
  let clientSource=null;if(script){const r=await fetch(script,{signal:AbortSignal.timeout(18000)});if(r.status===200)clientSource={url:script,source:await r.text()};}
  return {directories:results,clientSource};
 };
 return {url:'https://www.next.co.uk/shop/home/christmas-decorations',formats:['rawHtml'],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},skipTlsVerification:false,parsers:[],timeout:90000,actions:[{type:'executeJavascript',script:'('+action.toString()+')('+JSON.stringify(paths)+')'}]};
}

export function assertNextSourceApproval(grant,{used=0}={}){
 if(grant?.retailerId!=='nx'||grant?.purpose!=='one-next-official-source-request'||grant?.maxCredits!==5||grant?.maxRequests!==1||grant.closed===true||used!==0)throw Error('New explicit approval for one Next-only request up to five credits is required');
 return {maxCredits:5,maxRequests:1,automaticRetry:false};
}
