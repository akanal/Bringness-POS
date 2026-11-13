(()=>{
 let polling=false,displayed=null,notice=null,context=null;
 const marker='bringness-online-maintenance-reload';
 async function api(body){const r=await fetch('/api/v1/online-registers/maintenance-ack',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+localStorage.getItem('bringness-pos-token'),'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'Wartungsanforderung nicht bestätigt.'),{status:r.status});return d}
 function clear(){notice?.remove();notice=null;displayed=null;context=null}
 function button(parent,label,work){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=work;parent.append(b);return b}
 async function tick(){if(polling||document.hidden)return;polling=true;try{
  const reg=await window.onlineRegisterIdentity?.();if(!reg){clear();return}
  let previous;try{previous=JSON.parse(sessionStorage.getItem(marker)||'null')}catch{sessionStorage.removeItem(marker)}
  if(previous&&previous.deviceId===reg.id){if(Date.now()-previous.at<300000){try{await api({deviceKey:reg.deviceKey,id:previous.id,state:'completed',clientVersion:'web-maintenance-20261112'})}catch(e){if(![403,404,409].includes(e.status))throw e}}sessionStorage.removeItem(marker)}
  const job=reg.maintenance?.find(x=>x.state==='requested');if(!job){clear();return}
  const token=localStorage.getItem('bringness-pos-token');if(displayed===job.id&&context===token+'|'+reg.id)return;clear();context=token+'|'+reg.id;displayed=job.id;
  notice=document.createElement('aside');notice.className='browser-support-notice';notice.id='registerMaintenanceNotice';notice.setAttribute('role','alert');const msg=document.createElement('p');msg.textContent='Bringness bittet darum, diese Kasse für die Wartung neu zu laden. Erst offene Vorgänge abschließen. Es werden keine Daten gelöscht.';notice.append(msg);document.body.append(notice);
  button(notice,'Jetzt sicher neu laden',async e=>{const b=e.currentTarget;b.disabled=true;try{
   if(localStorage.getItem('bringness-pos-token')+'|'+reg.id!==context||document.getElementById('restaurant')?.value!==reg.restaurant_id)throw Error('Anmeldung oder Betrieb geändert.');
   if(window.posMaintenanceIdle?.()!==true)throw Error('Bitte zur Kassenansicht wechseln, den Warenkorb abschließen und ungeklärte Zahlungen prüfen.');
   // Persist the recovery marker before accepting; no reload if storage is unavailable.
   sessionStorage.setItem(marker,JSON.stringify({id:job.id,deviceId:reg.id,at:Date.now()}));
   await api({deviceKey:reg.deviceKey,id:job.id,state:'accepted'});
   if(window.posMaintenanceIdle?.()!==true){sessionStorage.removeItem(marker);throw Error('Ein neuer Vorgang verhindert das Neuladen. Anforderung wird beendet.');}
   location.reload();
  }catch(error){sessionStorage.removeItem(marker);msg.textContent=error.message;try{await api({deviceKey:reg.deviceKey,id:job.id,state:'declined'})}catch{}b.disabled=false}});
  button(notice,'Ablehnen',async()=>{try{await api({deviceKey:reg.deviceKey,id:job.id,state:'declined'});clear()}catch(e){msg.textContent=e.message}});
 }catch{clear()}finally{polling=false}}
 window.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')clear()});setInterval(tick,5000);
})();
