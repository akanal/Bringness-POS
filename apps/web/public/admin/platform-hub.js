(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>localStorage.getItem('bringness-pos-token');
 async function api(path){const r=await fetch(path,{headers:{authorization:'Bearer '+token()},signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Verwaltung nicht erreichbar');return d}
 let mounted=false,lastToken='',sequence=0;
 async function render(){
  const current=++sequence,p=document.getElementById('platformHub');
  p.innerHTML='<div class="card"><h2>Bringness POS & AI</h2><p>Plattformverwaltung für alle Kunden. Kundenkassen, Geräte, Konten und Lizenzen über die POS-Bereiche verwalten.</p><div class="toolbar"><a class="btn" href="/admin/ai-workspace.html?admin=1">AI-Verwaltung öffnen</a><button type="button" id="hubRefresh">Status aktualisieren</button></div></div><div class="grid"><div class="card"><h2>AI-Plattform</h2><div id="hubAi">Wird geladen…</div></div><div class="card"><h2>Offline-Verkäufe & Lagerabgleich</h2><div id="hubOffline">Wird geladen…</div></div></div>';
  p.querySelector('#hubRefresh').onclick=render;
  const results=await Promise.allSettled([api('/api/v1/platform/ai/overview'),api('/api/v1/platform/control/offline')]);
  if(current!==sequence)return;
  const [ai,offline]=results;
  if(ai.status==='fulfilled'){const s=ai.value.summary;p.querySelector('#hubAi').innerHTML='<p>Aktive Restaurants: <b>'+esc(s.activeRestaurants)+'</b> · Lieferanten: <b>'+esc(s.activeSuppliers)+'</b></p><p>Offene Liefermeldungen: <b>'+esc(s.openDeliveryIssues)+'</b> · Überfällige Positionen: <b>'+esc(s.overdueOrderLines)+'</b></p><p>Einzugsprobleme: <b>'+esc(s.collectionExceptions)+'</b> · Änderungen in 24 Stunden: <b>'+esc(s.changesToday)+'</b></p><p>In der AI-Verwaltung: Teilnehmer, Tarife, Abos, Lager, Prognosen, Beschaffung, Liefermeldungen, Werbung, Provisionen und Protokoll.</p>'}else p.querySelector('#hubAi').textContent=ai.reason.message;
  if(offline.status==='fulfilled'){const d=offline.value;p.querySelector('#hubOffline').innerHTML='<p>'+d.counts.map(c=>esc(c.stock_state)+': <b>'+esc(c.count)+'</b>').join(' · ')+'</p><p class="muted">Zeigt bereits übertragene Verkäufe. Noch lokal wartende Verkäufe sind erst nach einer Online-Verbindung sichtbar.</p>'+(d.limited?'<p>Die neuesten 100 offenen Abgleiche werden gezeigt.</p>':'')+d.sales.map(s=>'<div class="row"><b>'+esc(s.company_name)+' · '+esc(s.restaurant_name)+'</b><p>'+esc(s.device_name)+' · '+esc(s.stock_state)+' · '+esc(s.stock_error||'Abgleich ausstehend')+'</p></div>').join('')}else p.querySelector('#hubOffline').textContent=offline.reason.message;
 }
 async function check(){const next=token();if(next===lastToken)return;lastToken=next;
  if(!next){document.getElementById('platformHubTab')?.remove();document.getElementById('platformHub')?.remove();mounted=false;++sequence;return}
  try{await api('/api/v1/platform/control/companies');if(token()!==next)return;if(mounted)return;
   const tabs=document.querySelector('.tabs'),dash=document.getElementById('dash');if(!tabs||!dash){lastToken='';return}
   const button=document.createElement('button');button.type='button';button.id='platformHubTab';button.dataset.tab='platformHub';button.textContent='POS & AI';
   const panel=document.createElement('section');panel.id='platformHub';panel.className='panel';dash.append(panel);tabs.prepend(button);mounted=true;
   button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p===panel));render()};
  }catch{lastToken=''}
 }
 setInterval(check,2000);check();
})();
