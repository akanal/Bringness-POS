// Explicit host lifecycle only. Importing this module starts no timer and reads
// no credentials. Each tick invokes the existing GET-only marketplace worker.
export function startMarketplaceReconciliation({reconcile,intervalMs=60000,limit=5,onResult=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(typeof reconcile!=='function'||typeof onResult!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<60000||intervalMs>3600000||!Number.isInteger(limit)||limit<1||limit>5)throw Error('INVALID_MARKET_SCHEDULER');
 let stopped=false,timer=null,running=null;
 function schedule(){if(!stopped){timer=setTimer(()=>{timer=null;tick();},intervalMs);timer?.unref?.();}}
 function tick(){
  if(stopped)return Promise.resolve({stopped:true});if(running)return running;if(timer!==null){clearTimer(timer);timer=null;}
  running=(async()=>{
   let result;
   try{const r=await reconcile({limit});result={ok:true,checked:r.checked,failed:r.failed,busy:r.busy===true};}
   catch{result={ok:false,code:'MARKET_RECONCILIATION_UNAVAILABLE'};}
   try{Promise.resolve(onResult(result)).catch(()=>{});}catch{/* Observability must not stop payment recovery. */}
   return result;
  })().finally(()=>{running=null;schedule();});return running;
 }
 schedule();
 return {tick,async stop(){stopped=true;if(timer!==null)clearTimer(timer);timer=null;await running;}};
}
