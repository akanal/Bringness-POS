(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>localStorage.getItem('bringness-pos-token');
 async function api(path,options={}){const r=await fetch(path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+token()},signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'Verwaltung nicht erreichbar'),{status:r.status});return d}
 let mounted=false,lastToken='',sequence=0,reportSequence=0,reportBusy=false;
 async function refreshReportBadge(){
  if(!mounted||document.hidden)return;const session=token();
  try{const data=await api('/api/v1/platform/control/diagnostics/summary');if(token()!==session||!mounted)return;const tab=document.getElementById('platformHubTab');if(tab)tab.textContent=data.openCount?'POS · '+data.openCount+' Fehler':'POS';}catch{/* A failed badge refresh must not invent an error count. */}
 }
 async function loadReports(){
  const host=document.getElementById('hubDiagnostics');if(!host||reportBusy)return;
  const session=token(),current=++reportSequence,filter=host.querySelector('select')?.value||'active';
  const valid=()=>token()===session&&current===reportSequence&&host.isConnected;
  reportBusy=true;host.setAttribute('aria-busy','true');
  try{
   const result=await api('/api/v1/platform/control/diagnostics?state='+encodeURIComponent(filter));if(!valid())return;
   const picker=document.createElement('select');picker.setAttribute('aria-label','Fehlermeldungen filtern');
   for(const [value,label]of [['active','Offen und in Bearbeitung'],['resolved','Behoben'],['all','Alle']]){const option=document.createElement('option');option.value=value;option.textContent=label;picker.append(option);}picker.value=filter;picker.onchange=()=>{void loadReports();};
   const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Fehlermeldungen aktualisieren';refresh.onclick=()=>{void loadReports();};
   const count=document.createElement('p');count.textContent=result.openCount+' offene technische Meldung(en). Wiederholungen sind zusammengefasst.';
   const notice=document.createElement('p');notice.setAttribute('role','status');
   const rows=document.createElement('div');
   for(const report of result.reports){
    const row=document.createElement('div');row.className='row';const title=document.createElement('strong');title.textContent=report.code;
    const business=document.createElement('p');business.textContent=report.company_name+(report.restaurant_name?' · '+report.restaurant_name:' · keine Betriebsauswahl');
    const details=document.createElement('p');details.textContent=({open:'Offen',acknowledged:'In Bearbeitung',resolved:'Als behoben markiert'}[report.state]||'Unbekannt')+' · '+report.occurrences+' Meldung(en) · zuletzt '+new Date(report.last_seen_at).toLocaleString('de-DE');
    const version=document.createElement('small');version.textContent=report.component_version;
    row.append(title,business,details,version);
    if(report.state!=='resolved')for(const [state,label]of [['acknowledged','In Bearbeitung nehmen'],['resolved','Als behoben markieren']]){
     if(report.state===state)continue;const button=document.createElement('button');button.type='button';button.textContent=label;
     button.onclick=async()=>{
      if(reportBusy)return;reportBusy=true;host.setAttribute('aria-busy','true');for(const node of host.querySelectorAll('button,select'))node.disabled=true;
      try{await api('/api/v1/platform/control/diagnostics/'+encodeURIComponent(report.id)+'/status',{method:'POST',body:JSON.stringify({state,revision:report.revision})});if(!valid())return;}
      catch(error){if(valid())notice.textContent=error.message;return;}
      finally{if(current===reportSequence)reportBusy=false;if(valid()){host.removeAttribute('aria-busy');for(const node of host.querySelectorAll('button,select'))node.disabled=false;}}
      if(valid())void loadReports();
     };row.append(button);
    }
    rows.append(row);
   }
   if(!result.reports.length)rows.textContent='Keine technischen Fehlermeldungen in dieser Auswahl.';
   const privacy=document.createElement('p');privacy.className='muted';privacy.textContent='Nur technische Codes und serverseitig geprüfte Betriebszuordnung. Keine Passwörter, Beleginhalte oder Kundendaten. Vor der Anmeldung oder bei fehlendem Sitzungsspeicher ist nur die lokale Diagnose verfügbar.';
   if(result.limited)privacy.textContent+=' Die neuesten 100 Meldungen werden gezeigt.';
   host.replaceChildren(picker,refresh,count,notice,rows,privacy);
   const tab=document.getElementById('platformHubTab');if(tab)tab.textContent=result.openCount?'POS · '+result.openCount+' Fehler':'POS';
  }catch(error){if(valid())host.textContent='Fehlermeldungen konnten nicht geladen werden. '+error.message;}
  finally{if(current===reportSequence){reportBusy=false;if(host.isConnected)host.removeAttribute('aria-busy');}}
 }

 async function render(){
  reportBusy=false;++reportSequence;const current=++sequence,p=document.getElementById('platformHub');
  p.innerHTML='<div class="card"><h2>Bringness POS</h2><p>Plattformverwaltung für alle Kunden. Kundenkassen, Geräte, Konten und Lizenzen über die POS-Bereiche verwalten.</p><div class="toolbar"><a class="btn" href="/admin/systems.html">Bildschirme, Personal & Center verwalten</a><button type="button" id="hubRefresh">Status aktualisieren</button></div></div><div class="card"><h2>Automatische Fehlermeldungen</h2><div id="hubDiagnostics">Wird geladen…</div></div><div class="card"><h2>Bezeichnungen je Betrieb</h2><p>Nach Absprache Tisch, Zimmer oder eine eigene Bezeichnung ändern. Ausschließlich für die Bringness-Plattformverwaltung.</p><div id="hubTerms">Wird geladen…</div></div><div class="grid"><div class="card"><h2>Offline-Verkäufe & Lagerabgleich</h2><div id="hubOffline">Wird geladen…</div></div></div>';
  p.querySelector('#hubRefresh').onclick=render;void loadReports();
  const results=await Promise.allSettled([api('/api/v1/platform/control/offline'),api('/api/v1/platform/control/registers')]);
  if(current!==sequence)return;
  const [offline,registers]=results;const terms=p.querySelector('#hubTerms');if(registers.status==='fulfilled'){terms.innerHTML=registers.value.restaurants.map(r=>'<div class="row"><b>'+esc(r.company_name)+' · '+esc(r.name)+'</b> <a href="/pos/place-terminology.html?admin=1&amp;restaurantId='+encodeURIComponent(r.id)+'">Bezeichnung verwalten</a></div>').join('')||'Keine Betriebe vorhanden.';}else terms.textContent=registers.reason.message;
  if(offline.status==='fulfilled'){const d=offline.value;p.querySelector('#hubOffline').innerHTML='<p>'+d.counts.map(c=>esc(c.stock_state)+': <b>'+esc(c.count)+'</b>').join(' · ')+'</p><p class="muted">Zeigt bereits übertragene Verkäufe. Noch lokal wartende Verkäufe sind erst nach einer Online-Verbindung sichtbar.</p>'+(d.limited?'<p>Die neuesten 100 offenen Abgleiche werden gezeigt.</p>':'')+d.sales.map(s=>'<div class="row"><b>'+esc(s.company_name)+' · '+esc(s.restaurant_name)+'</b><p>'+esc(s.device_name)+' · '+esc(s.stock_state)+' · '+esc(s.stock_error||'Abgleich ausstehend')+'</p></div>').join('')}else p.querySelector('#hubOffline').textContent=offline.reason.message;
 }
 async function check(){const next=token();if(next===lastToken)return;lastToken=next;document.getElementById('platformHubTab')?.remove();document.getElementById('platformHub')?.remove();mounted=false;++sequence;++reportSequence;reportBusy=false;
  if(!next){document.getElementById('platformHubTab')?.remove();document.getElementById('platformHub')?.remove();mounted=false;++sequence;return}
  try{await api('/api/v1/platform/control/companies');if(token()!==next)return;if(mounted)return;
   const tabs=document.querySelector('.tabs'),dash=document.getElementById('dash');if(!tabs||!dash){lastToken='';return}
   const button=document.createElement('button');button.type='button';button.id='platformHubTab';button.dataset.tab='platformHub';button.textContent='POS';
   const panel=document.createElement('section');panel.id='platformHub';panel.className='panel';dash.append(panel);tabs.prepend(button);mounted=true;void refreshReportBadge();
   button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p===panel));render()};
  }catch{lastToken=''}
 }
 setInterval(check,2000);setInterval(()=>{if(document.getElementById('platformHub')?.classList.contains('active')&&!document.hidden)void loadReports();else void refreshReportBadge();},60000);check();
})();
