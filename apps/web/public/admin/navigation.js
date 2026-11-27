// Navigation only: existing panels, handlers, sessions and server permissions remain authoritative.
(()=>{
 const groups=[['overview','Übersicht'],['registers','Kassen & Betriebe'],['customers','Kunden & Abrechnung'],['team','Team & Zugänge'],['support','Support & E-Mail'],['system','System & Sicherheit']];
 const definitions=[
  {id:'overview',group:'overview',label:'Überblick',tab:'overview'},
  {id:'registers',group:'registers',label:'Betriebe & Geräte',tab:'allRegisters'},
  {id:'online',group:'registers',label:'Online-Kassen & Freigaben',href:'/admin/online-registers.html',requires:'[data-tab="platformHub"]'},
  {id:'modules',group:'registers',label:'Bildschirme, Personal & Center',href:'/admin/systems.html',requires:'[data-tab="platformHub"]'},
  {id:'business',group:'registers',label:'Eigener Betrieb',tab:'controlCenter'},
  {id:'devices',group:'registers',label:'Windows-Geräte',tab:'devicesPanel'},
  {id:'settings',group:'registers',label:'Kasseneinstellungen',href:'/pos/?view=einstellungen'},
  {id:'customers',group:'customers',label:'Kunden suchen',tab:'customerDetail'},
  {id:'licences',group:'customers',label:'Module & Preise',tab:'customers'},
  {id:'billing',group:'customers',label:'Eigene Zahlungen & Rechnungen',tab:'billingPanel'},
  {id:'subscription',group:'customers',label:'Eigenes Abonnement',tab:'subscriptionPanel'},
  {id:'team',group:'team',label:'Eigenes Team',tab:'teamCenter'},
  {id:'accounts',group:'team',label:'Kundenkonten',tab:'accountCenter'},
  {id:'service',group:'team',label:'Service-App öffnen',href:'/service/'},
  {id:'requests',group:'support',label:'Supportanfragen',tab:'supportCenter'},
  {id:'remote',group:'support',label:'Fernhilfe',tab:'remoteHelp'},
  {id:'advertising',group:'support',label:'Werbung · Inhaber',href:'/admin/advertising.html',requires:'[data-tab="platformHub"]'},
  {id:'mail',group:'support',label:'E-Mail senden',href:'/admin/mail.html',requires:'[data-tab="platformHub"]'},
  {id:'diagnostics',group:'system',label:'Diagnose & Abgleich',tab:'platformHub'},
  {id:'system',group:'system',label:'System & Betriebsprotokoll',tab:'systemPanel'},
  {id:'audit',group:'system',label:'Plattformprotokoll',tab:'globalAudit'},
  {id:'tax',group:'system',label:'Steuer & Prüfung',tab:'taxCenter'},
  {id:'password',group:'system',label:'Passwort ändern',tab:'securityPanel'},
  {id:'security',group:'system',label:'Zwei-Faktor-Anmeldung',href:'/superadmin/security.html?from=pos',requires:'[data-tab="platformHub"]'}
 ];
 const descriptions={overview:'Kennzahlen Ihrer Verwaltung auf einen Blick.',registers:'Betriebe, Kassen und Betriebsmodule an einem Ort.',customers:'Kunden suchen, Module verwalten und Abrechnungen prüfen.',team:'Mitarbeiter und Kundenkonten mit ihren bestehenden Zugängen verwalten.',support:'Supportanfragen bearbeiten, Fernhilfe öffnen oder eine E-Mail schreiben.',system:'Technischen Zustand, Protokolle und Sicherheit prüfen.'};
 let legacy,nav,primary,secondary,description,signature='',subSignature='',active='overview',items=[],requested=route(),selecting=false;
 const remembered=new Map();
 function route(){const parts=location.hash.slice(1).split('/');return parts.length===2&&groups.some(([id])=>id===parts[0])?{group:parts[0],id:parts[1]}:null;}
 function available(){
  const global=Boolean(legacy.querySelector('[data-tab="allRegisters"]'));
  const list=definitions.filter(item=>(!item.tab||legacy.querySelector('[data-tab="'+item.tab+'"]'))&&(!item.requires||document.querySelector(item.requires))&&!(global&&['business','devices'].includes(item.id)));
  // Preserve future extensions instead of silently putting them out of reach.
  for(const button of legacy.querySelectorAll('[data-tab]'))if(!definitions.some(item=>item.tab===button.dataset.tab))list.push({id:'extension-'+button.dataset.tab,group:'system',label:button.textContent,tab:button.dataset.tab});
  return list;
 }
 function canonical(tab){if(legacy.querySelector('[data-tab="allRegisters"]')&&['devicesPanel','controlCenter'].includes(tab))return 'allRegisters';return tab;}
 function currentItem(){const panel=document.querySelector('#dash > .panel.active');return items.find(item=>item.tab&&item.tab===canonical(panel?.id))||items.find(item=>item.tab&&item.id===active)||items.find(item=>item.tab);}
 function setAddress(item){const next='#'+item.group+'/'+item.id;if(location.hash!==next)try{history.pushState(null,'',next);}catch{/* Navigation also works when browser history is unavailable. */}}
 function select(id,{address=true}={}){
  const item=items.find(item=>item.id===id);if(!item||!item.tab)return;
  requested=null;selecting=true;
  try{
   const target=legacy.querySelector('[data-tab="'+item.tab+'"]');
   if(!document.getElementById(item.tab)?.classList.contains('active'))target?.click();
   sync(item);if(address)setAddress(item);
  }finally{selecting=false;}
 }
 function badge(){
  const button=primary.querySelector('[data-admin-group="system"]');if(!button)return;
  const raw=legacy.querySelector('[data-tab="platformHub"]')?.dataset.adminCount,count=Number(raw);
  let mark=button.querySelector('.admin-nav-badge');
  if(raw!==undefined&&Number.isSafeInteger(count)&&count>0){if(!mark){mark=document.createElement('span');mark.className='admin-nav-badge';mark.setAttribute('aria-hidden','true');button.append(mark);}mark.textContent=String(count);button.setAttribute('aria-label','System & Sicherheit · '+count+' offene technische Meldungen');}
  else{mark?.remove();button.removeAttribute('aria-label');}
 }
 function sync(item=currentItem()){
  if(!item)return;active=item.id;remembered.set(item.group,item.id);
  for(const button of primary.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.adminGroup===item.group));
  const entries=items.filter(value=>value.group===item.group),next=entries.map(value=>value.id).join('|');
  if(subSignature!==next){
   subSignature=next;secondary.replaceChildren();
   for(const value of entries){
    const button=document.createElement(value.href?'a':'button');button.textContent=value.label;button.dataset.adminItem=value.id;
    if(value.href){button.href=value.href;}else{button.type='button';button.onclick=()=>select(value.id);}
    secondary.append(button);
   }
  }
  for(const button of secondary.children){const selected=button.dataset.adminItem===item.id;if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  secondary.hidden=entries.length<2;description.textContent=descriptions[item.group];badge();
  nav.dataset.group=item.group;
 }
 function refresh(){
  if(!legacy)return;document.getElementById('adminMore')?.remove();items=available();
  const next=items.map(item=>item.id).join('|');
  if(signature!==next){
   signature=next;primary.replaceChildren();subSignature='';
   for(const [id,label]of groups){if(!items.some(item=>item.group===id))continue;
    const button=document.createElement('button');button.type='button';button.dataset.adminGroup=id;button.textContent=label;
    button.onclick=()=>{const preferred=remembered.get(id),entry=items.find(item=>item.id===preferred&&item.group===id&&item.tab)||items.find(item=>item.group===id&&item.tab);if(entry)select(entry.id);};primary.append(button);
   }
  }
  const target=requested&&items.find(item=>item.id===requested.id&&item.group===requested.group&&item.tab);
  if(target){select(target.id,{address:false});return;}
  const current=currentItem();
  if(current?.tab&&!document.getElementById(current.tab)?.classList.contains('active'))select(current.id,{address:false});else sync(current);
 }
 function mount(){
  if(document.getElementById('adminNavigation'))return;
  const dash=document.getElementById('dash');legacy=dash?.querySelector('.tabs');if(!legacy)return;
  nav=document.createElement('section');nav.id='adminNavigation';nav.setAttribute('aria-label','POS-Verwaltung');
  primary=document.createElement('nav');primary.className='admin-nav-groups';primary.setAttribute('aria-label','Verwaltungsbereiche');
  secondary=document.createElement('nav');secondary.className='admin-nav-items';secondary.setAttribute('aria-label','Funktionen im gewählten Bereich');
  description=document.createElement('p');description.className='admin-nav-description';nav.append(primary,secondary,description);legacy.before(nav);
  legacy.hidden=true;
  legacy.addEventListener('click',event=>{
   const target=event.target.closest('[data-tab]');if(!target)return;
   const mapped=canonical(target.dataset.tab);
   if(mapped!==target.dataset.tab){event.preventDefault();event.stopImmediatePropagation();const entry=items.find(item=>item.tab===mapped);if(entry)select(entry.id);return;}
   queueMicrotask(()=>{if(selecting)return;const item=currentItem();sync(item);if(item)setAddress(item);});
  },true);
  new MutationObserver(refresh).observe(legacy,{childList:true,subtree:true,attributes:true,attributeFilter:['data-admin-count']});
  const applyRoute=()=>{requested=route();const target=requested&&items.find(item=>item.id===requested.id&&item.group===requested.group&&item.tab);if(target)select(target.id,{address:false});};
  window.addEventListener('popstate',applyRoute);window.addEventListener('hashchange',applyRoute);
  window.BringnessAdminNavigation={refresh,open:tab=>{const item=items.find(value=>value.tab===canonical(tab));if(item)select(item.id);}};
  refresh();
 }
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();
