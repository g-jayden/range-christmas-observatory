export function sourceCircuitOpen(health,engine='firefox'){
 return health?.state==='blocked'&&health.engine===engine;
}
export function recordSourceOutcome(previous,{success,engine='firefox',message='',now=new Date().toISOString()}){
 if(success)return {state:'ready',engine,consecutiveFailures:0,verifiedAt:now,lastSuccessAt:now};
 const consecutiveFailures=(previous?.engine===engine?previous.consecutiveFailures||0:0)+1;
 const denied=/HTTP\s*40[13]|Just a moment|security verification|安全验证|验证码|无权|not authorized/i.test(message);
 return {state:denied||consecutiveFailures>=2?'blocked':'retry-available',engine,consecutiveFailures,lastFailureAt:now,lastSuccessAt:previous?.lastSuccessAt||null,reason:message.slice(0,400),automaticAttemptLimit:2};
}
