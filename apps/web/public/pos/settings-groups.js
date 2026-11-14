(()=>{
 const groups=[['business','Betrieb & Produkte'],['devices','Geräte & Anzeigen'],['access','Mitarbeiter & Zugriff'],['finance','Zahlung & Buchhaltung'],['account','Konto & Module']];
 const classify=card=>card.dataset.settingsGroup||(
  card.matches('#posSettingsOperations')||card.querySelector('#openDisplaySettings,#customerDisplayEnabled')?'devices':
  card.querySelector('#openPersonnelSettings,#onlineGrant,#onlineGrantState,#waiterAccountForm')?'access':
  card.querySelector('#openFiscalSettings')?'finance':'business');
 window.bnGroupPosSettings=area=>{
  if(!area||document.body.dataset.posView!=='einstellungen')return;
  let shell=area.querySelector(':scope > .pos-settings-groups');
  if(!shell){shell=document.createElement('div');shell.className='pos-settings-groups';for(const [id,label]of groups){const group=document.createElement('details');group.className='pos-settings-group';group.dataset.settingsSection=id;const summary=document.createElement('summary');summary.textContent=label;const body=document.createElement('div');body.className='pos-settings-group-body';group.append(summary,body);shell.append(group);}area.prepend(shell);}
  for(const card of [...area.children]){if(card===shell||!card.classList.contains('modulecard'))continue;const group=classify(card),target=shell.querySelector('[data-settings-section="'+(groups.some(([id])=>id===group)?group:'business')+'"] .pos-settings-group-body');target.append(card);}
 };
 const observer=new MutationObserver(()=>{const area=document.getElementById('moduleBody');if(area?.querySelector('.pos-settings-groups'))window.bnGroupPosSettings(area);});observer.observe(document.body,{childList:true,subtree:true});
})();
