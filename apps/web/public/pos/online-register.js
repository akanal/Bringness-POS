(()=>{
 let current=null,busy=false,lastIdentity='',lastToken='',lastSeen=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function request(path,b){const token=localStorage.getItem('bringness-pos-token');const r=await fetch('/api/v1/online-registers/'+path,{method:'POST',signal:AbortSignal.timeout(15000),cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(!r.ok)throw Error(d.error||'Kassenverwaltung nicht verfügbar.');return d}
 async function identify(){
  const rid=document.getElementById('restaurant')?.value,token=localStorage.getItem('bringness-pos-token');if(!rid||!token||!document.getElementById('workspace')?.classList.contains('show')){current=null;lastIdentity='';return null}
  const identity=rid+'|'+token;if(identity===lastIdentity&&Date.now()-lastSeen<30000)return current;
  if(busy)return null;busy=true;try{let key=localStorage.getItem('bringness-online-register:'+rid);if(!/^[a-f0-9]{64}$/.test(key||'')){const bytes=crypto.getRandomValues(new Uint8Array(32));key=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem('bringness-online-register:'+rid,key)}const d=await request('self',{restaurantId:rid,deviceKey:key});if(document.getElementById('restaurant')?.value!==rid||localStorage.getItem('bringness-pos-token')!==token)return null;current={...d,deviceKey:key};lastIdentity=identity;lastToken=token;lastSeen=Date.now();return current}finally{busy=false}
 }
 window.renderOnlineRegister=async area=>{
  const box=document.createElement('section');box.className='modulecard';box.innerHTML='<h3>Kassen-ID & Fernverwaltung</h3><p role="status">Kassenkennung wird geladen …</p>';area.append(box);
  try{const reg=await identify();if(!reg){box.querySelector('p').textContent='Bitte Kasse anmelden und erneut öffnen.';return}box.innerHTML='<h3>Kassen-ID & Fernverwaltung</h3><p>Diese Online-Kasse: <strong>'+esc(reg.id)+'</strong></p><p>Die ID dient zum Finden, nicht als Passwort. Sie bleibt in diesem Browserprofil für diesen Betrieb erhalten. Bei gelöschtem Browserspeicher entsteht ein neuer Arbeitsplatz.</p><p>Bringness darf nach deiner Freigabe eine Stunde lang die Speisekarte und Betriebseinstellungen bearbeiten sowie Diagnose und Zugriffsverlauf lesen. Widerruf ist jederzeit möglich.</p><p id="onlineGrantState" role="status"></p><button type="button" id="onlineGrant">Verwaltung für 1 Stunde freigeben</button> <button type="button" id="onlineRevoke">Freigabe widerrufen</button><p>Bildschirmhilfe benötigt eine zusätzliche Freigabe im Browser.</p>';
   const status=()=>box.querySelector('#onlineGrantState').textContent=reg.management_until&&Date.parse(reg.management_until)>Date.now()?'Verwaltung freigegeben bis '+new Date(reg.management_until).toLocaleTimeString('de-DE'):'Verwaltung nicht freigegeben.';status();
   for(const [id,enabled] of [['onlineGrant',true],['onlineRevoke',false]])box.querySelector('#'+id).onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{if(localStorage.getItem('bringness-pos-token')!==lastToken||document.getElementById('restaurant')?.value!==reg.restaurant_id)throw Error('Anmeldung oder Betrieb geändert. Einstellungen neu öffnen.');const d=await request('grant',{id:reg.id,enabled});reg.management_until=d.management_until;status()}catch(e){box.querySelector('#onlineGrantState').textContent=e.message}finally{button.disabled=false}};
  }catch(e){box.querySelector('p').textContent=e.message}
 };
 window.onlineRegisterIdentity=identify;
 setInterval(()=>{if(!document.hidden)identify().catch(()=>{})},15000);
})();
