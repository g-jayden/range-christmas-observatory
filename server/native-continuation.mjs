export function nativeContinuation(status,{depth=0,used=0,reserved=0,monthLimit,authorizedUnlimitedNative=false}={}) {
  if(!Number.isInteger(depth)||depth<0||depth>8)throw Error('Invalid native continuation bound');
  if((!Number.isFinite(monthLimit)&&!(authorizedUnlimitedNative&&(monthLimit===null||monthLimit===Infinity)))||!Number.isFinite(used)||used<0||!Number.isFinite(reserved)||reserved<0)throw Error('Approved native budget unavailable');
  if(!(status?.remaining>0)||!Number.isInteger(status.verifiedThisRun)||status.verifiedThisRun<1||depth>=8)return{continue:false,reason:'complete-no-progress-or-depth-limit'};
  if(!authorizedUnlimitedNative&&monthLimit-used-reserved<2)return{continue:false,reason:'approved-monthly-limit'};
  return{continue:true,depth:depth+1,maximumDepth:8};
}
