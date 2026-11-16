// Best-effort technical reporting to the existing first-party admin service only.
(()=>{
 'use strict';
 if(window.bnPosDiagnosticDelivery)return;
 const technical=/^POS-(?:LOGIN|REGISTER|RESET|LOAD|SAVE|CONNECTION|START|DISPLAY|PERSONNEL|CATALOG|TAX|AVAILABILITY|STOCK|TRADE)-(?:NETWORK|TIMEOUT|RESPONSE|SERVER|STORAGE|FAILED)$/;
 const version='pos-diagnostics-admin-20261116',queue=new Map(),recent=new Map();
 let session=null,blocked=null,generation=0,running=false,controller=null,retryTimer=null;
 function clear(){generation++;queue.clear();recent.clear();clearTimeout(retryTimer);retryTimer=null;controller?.abort();controller=null;}
 function identity(){
  let current=null;try{current=localStorage.getItem('bringness-pos-token');}catch{}
  if(current!==session){clear();session=current;blocked=null;}
  return current;
 }
 async function flush(){
  const token=identity();if(running||!token||token===blocked||navigator.onLine===false)return;
  clearTimeout(retryTimer);retryTimer=null;running=true;const epoch=generation;
  try{
   for(const [id,item]of queue){
    if(epoch!==generation||identity()!==token)break;
    if(Date.now()-item.created>900000||item.attempts>=3){queue.delete(id);continue;}
    if(item.attempts&&Date.now()-item.lastAttempt<30000)continue;
    item.attempts++;item.lastAttempt=Date.now();controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),5000);
    try{
     const response=await fetch('/api/v1/pos-diagnostics',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,signal:controller.signal,headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(item.payload)});
     if(epoch!==generation)break;
     if(response.status===202||response.status>=400&&response.status<500){queue.delete(id);}
     if(response.status===401){queue.clear();blocked=token;break;}
     if(!response.ok)break;
    }catch{/* No second diagnostic and no business-request retry on delivery failure. */break;}
    finally{clearTimeout(timer);controller=null;}
   }
  }finally{running=false;if(epoch!==generation&&queue.size)void flush();else if(queue.size&&navigator.onLine!==false&&identity()===token&&token!==blocked)retryTimer=setTimeout(()=>{retryTimer=null;void flush();},30000);}
 }
 function enqueue(record){
  const token=identity();if(!token||token===blocked||record?.version!==version||!(technical.test(record?.code||'')||record?.code==='POS-START-FAILED')||typeof record.online!=='boolean'||!crypto.randomUUID)return;
  let restaurantId=document.getElementById('restaurant')?.value||null;
  if(restaurantId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId))restaurantId=null;
  const now=Date.now(),key=(restaurantId||'')+'|'+record.code;
  for(const [key,time]of recent)if(now-time>=120000)recent.delete(key);
  if(recent.has(key)){void flush();return;}
  recent.set(key,now);if(queue.size>=20)queue.delete(queue.keys().next().value);
  const payload={eventId:crypto.randomUUID(),code:record.code,version,online:record.online,restaurantId};
  queue.set(payload.eventId,{payload,created:now,lastAttempt:0,attempts:0});void flush();
 }
 window.bnPosDiagnosticDelivery={enqueue,clear};
 window.addEventListener('online',()=>{void flush();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void flush();});
 window.addEventListener('storage',event=>{if(event.key===null||event.key==='bringness-pos-token'){clear();identity();}});
 window.addEventListener('pagehide',clear);
 document.getElementById('restaurant')?.addEventListener('change',clear);
})();
