import {NEXT_DIRECTORIES} from '../web/nx-model.mjs';

// Request preparation only. This module does not perform network calls.
// A new explicit, bounded user approval is required before a caller submits it.
export function buildNextSourceRequest(phase='directories'){
 if(phase==='business-data'){
 const action=async()=>{
  const results=[],requests=[];
  const paths=['/shop/home/christmas-decorations/baubles','/shop/home/christmas-decorations/wreath','/shop/home/christmas-decorations/garland','/shop/home/christmas-decorations/christmas-trees','/shop/home/christmas-decorations/f/type-ornaments'];
  for(const path of paths){const u=new URL('https://api.nextdirect.com/api/search/next/GB/en/v1/item-aggregation');u.search=new URLSearchParams({url:'https://www.next.co.uk'+path,type:'Category',start:'0',pageSize:'900'});requests.push({kind:'directory-api',url:u.href});}
  requests.push({kind:'summary-api',url:'https://api.nextdirect.com/api/edge-aggregator/product-summary/v1/index.json?realm=next&territory=GB&language=en&productIds=V52416%7cproduct'});
  requests.push({kind:'pdp',url:'https://www.next.co.uk/style/sv024193/v52416'});
  for(const request of requests){const r=await fetch(request.url,{signal:AbortSignal.timeout(20000)}),text=await r.text();results.push({...request,status:r.status,text:r.status===200?text:null});if([401,403,429].includes(r.status))return {results,blocked:true};}
  return {results};
 };
 return {url:'https://www.next.co.uk/shop/home/christmas-decorations',formats:['rawHtml'],onlyMainContent:false,maxAge:0,proxy:'enhanced',location:{country:'GB',languages:['en-GB']},skipTlsVerification:false,parsers:[],timeout:120000,actions:[{type:'executeJavascript',script:'('+action.toString()+')()'}]};
 }
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
