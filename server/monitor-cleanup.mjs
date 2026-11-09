import {control} from './cloud-client.mjs';
export async function releaseUnusedMonitor(tick,controlCall=control){
 if(!tick?.monitor||!tick.monitorLease)return false;
 try{await controlCall('/internal/monitor-complete',{lease:tick.monitorLease,success:false,retryable:true,error:'工作流在采集前停止；本次没有启动付费抓取',scanned:0,newCount:0});return true}catch(e){if(e.status!==409)throw e;return false;}
}
