const $=id=>document.getElementById(id),from=new URLSearchParams(location.search).get('from')||'market';
const sources={market:['bringness-market-admin-token','/superadmin/','market'],pos:['bringness-pos-token','/admin/','pos'],systems:['bringness-pos-admin-token','/admin/systems.html','pos'],ai:['bringness-pos-token','/admin/ai-workspace.html?admin=1','ai']};
const [key,back,theme]=sources[from]||sources.market,token=localStorage.getItem(key);
let pending=null,status=null,busy=false,closed=false,generation=0;
const buttonLabels=Object.fromEntries(['begin','activate','disable'].map(id=>[id,$(id).textContent]));
const requests=new Set(),feedback={begin:$('form-feedback'),activate:$('activation-feedback'),disable:$('disable-feedback')};
document.querySelector('header').dataset.adminProduct=theme;$('back').href=back;$('sign-in').href=back;
function message(text,bad=false,stage=null){
 $('message').textContent=text;$('message').dataset.error=String(bad);$('message').setAttribute('aria-live',stage?'off':'polite');
 for(const [name,node] of Object.entries(feedback)){node.hidden=!text||name!==stage;node.textContent=name===stage?text:'';node.dataset.error=String(bad)}
 if(bad){if(stage==='disable')$('disable-section').open=true;const node=feedback[stage]||$('message');node.focus({preventScroll:true});node.scrollIntoView({block:'nearest'})}
}
const invalid=(text,field,stage)=>Object.assign(Error(text),{field,stage});
const digits=value=>value.replace(/\s/gu,'');
function controls(disabled){for(const button of $('loginForm').querySelectorAll('button'))button.disabled=disabled;$('loginForm').setAttribute('aria-busy',String(disabled))}
async function api(action,body){
 if(closed)throw Object.assign(Error('Bitte diese Seite neu laden.'),{stale:true});
 const epoch=generation,controller=new AbortController();requests.add(controller);const timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch('/api/v1/platform/security/'+action,{method:body?'POST':'GET',credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(epoch!==generation||closed)throw Object.assign(Error('Ansicht gewechselt.'),{stale:true});
  if(!response.ok)throw Object.assign(Error(data.error||'Die Sicherheitseinstellungen sind gerade nicht erreichbar.'),{status:response.status,...(data.error==='Das aktuelle Passwort ist nicht korrekt.'?{stage:'begin',field:'password'}:{})});
  return data;
 }catch(error){
  if(epoch!==generation||closed)throw Object.assign(Error('Ansicht gewechselt.'),{stale:true});
  if(error.status||error.stale)throw error;
  throw Object.assign(Error('Die Verbindung wurde unterbrochen oder hat zu lange gedauert. Bitte erneut versuchen.'),{uncertain:true});
 }finally{clearTimeout(timeout);requests.delete(controller)}
}
function wipe(){
 $('loginForm').reset();pending=null;$('manual-key').value='';$('qr').removeAttribute('src');$('recovery-codes').value='';$('activation-code').value='';$('disable-code').value='';$('saved').checked=false;$('confirm-disable').checked=false;$('enrollment').hidden=true;
 for(const input of $('loginForm').querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');
}
function paint(){
 $('settings').hidden=false;$('sign-in').hidden=true;$('state').textContent=status.enabled?'Aktiv – neue Anmeldungen benötigen dein Passwort und einen Handy- oder Wiederherstellungscode.':'Noch nicht aktiviert. Deine bestehende Anmeldung bleibt bis zur erfolgreichen Einrichtung unverändert.';
 $('remaining').hidden=!status.enabled;$('remaining').textContent=status.recoveryRemaining+' Wiederherstellungscodes übrig.';
 $('form-title').textContent=status.enabled?'Sicherheit verwalten':'Authenticator einrichten';$('intro').hidden=status.enabled;$('begin').hidden=status.enabled||Boolean(pending);$('begin').disabled=busy||!status.setupAvailable;$('disable-section').hidden=!status.enabled;$('recent-recovery').hidden=!status.recentRecovery;
 if(!status.setupAvailable&&!status.enabled)message('Die geschützte Serverkonfiguration ist noch nicht verfügbar.',true,'begin');
}
async function load(){const current=await api('status');status=current;paint()}
function signedOut(error){$('settings').hidden=true;$('state').textContent='Die persönlichen Sicherheitseinstellungen sind nicht geöffnet.';$('sign-in').hidden=false;message(error.message,true)}
function success(action){wipe();paint();message(action==='activate'?'Zwei-Faktor-Anmeldung ist aktiv. Deine anderen Sitzungen wurden abgemeldet.':'Zwei-Faktor-Anmeldung deaktiviert. Du kannst den Authenticator jetzt neu einrichten.');$('state').scrollIntoView({block:'nearest'})}
$('restart').onclick=()=>{wipe();paint();message('Bitte neu beginnen und den neu angezeigten QR-Code mit der Authenticator-App scannen.',false,'begin');$('form-title').scrollIntoView({block:'start'})};
$('save-codes').onclick=()=>{if(!pending)return;const blob=new Blob(['Bringness – einmalige Wiederherstellungscodes\n\n'+$('recovery-codes').value+'\n\nGetrennt vom Handy sicher aufbewahren.\n'],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Bringness-Wiederherstellungscodes.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('loginForm').onsubmit=async event=>{
 event.preventDefault();if(busy)return;if(closed){message('Die Ansicht wurde unterbrochen. Bitte die Seite neu laden.',true);return}
 const action=status?.enabled?'disable':pending?'activate':'begin',password=$('loginForm').elements.password.value,epoch=generation;
 const button=action==='begin'?$('begin'):action==='activate'?$('activate'):$('disable'),label=button.textContent;
 let sent=false;
 try{
  for(const input of $('loginForm').querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');
  if(!password)throw invalid('Bitte dein aktuelles Passwort erneut eingeben.','password','begin');
  const code=digits($(action==='disable'?'disable-code':'activation-code').value);
  if(action==='activate'){
   if(!$('saved').checked)throw invalid('Bitte zuerst bestätigen, dass du die Wiederherstellungscodes sicher gespeichert hast.','saved','activate');
   if(!/^\d{6}$/.test(code))throw invalid('Bitte den vollständigen sechsstelligen Handy-Code eingeben.','activation-code','activate');
   $('activation-code').value=code;
  }
  if(action==='disable'&&!$('confirm-disable').checked)throw invalid('Bitte die Deaktivierung ausdrücklich bestätigen.','confirm-disable','disable');
  busy=true;controls(true);button.textContent='Wird geprüft …';message('Wird geprüft …',false,action);
  if(action==='begin'){
   const data=await api('begin',{password});pending={enrollment:data.enrollment,recoveryCount:data.recoveryCodes.length};$('qr').src=data.qr;$('manual-key').value=data.secret;$('recovery-codes').value=data.recoveryCodes.join('\n');$('enrollment').hidden=false;paint();message('QR-Code scannen, Wiederherstellungscodes speichern und den Handy-Code bestätigen.');$('qr').scrollIntoView({block:'start',behavior:'smooth'});
  }else{
   sent=true;
   const result=await api(action,action==='activate'?{password,enrollment:pending.enrollment,code,saved:true}:{password,code,confirm:true});
   // The committed write response is definitive; a later status refresh must not hide success.
   if(result.enabled===(action==='activate'))status={...status,enabled:result.enabled,recoveryRemaining:result.enabled?pending.recoveryCount:0,recentRecovery:false};
   else {await load();if(status.enabled!==(action==='activate'))throw Error('Die Änderung konnte nicht bestätigt werden. Bitte den Status erneut prüfen.')}
   success(action);
  }
 }catch(error){
  if(error.stale||epoch!==generation)return;
  if(error.status===401||error.status===403){wipe();signedOut(error);return}
  // Only an interrupted/competing write has an ambiguous result. Never delay a local validation error.
  if(sent&&(error.uncertain||error.status===409)){
   try{await load();if(action==='activate'&&status.enabled||action==='disable'&&!status.enabled){success(action);return}}catch{}
   if(epoch!==generation||closed)return;
  }
  if(error.field){const input=error.field==='password'?$('loginForm').elements.password:$(error.field);input?.setAttribute('aria-invalid','true')}
  message(error.message,true,error.stage||action);
 }finally{
  if(epoch===generation){busy=false;button.textContent=label;controls(false);if(status)paint()}
 }
};
function closeView(){generation++;closed=true;for(const controller of requests)controller.abort();busy=false;wipe();for(const [id,label] of Object.entries(buttonLabels))$(id).textContent=label}
window.addEventListener('pagehide',closeView);
window.addEventListener('storage',event=>{if((event.key===key||event.key===null)&&localStorage.getItem(key)!==token){closeView();$('settings').hidden=true;$('sign-in').hidden=false;message('Konto gewechselt. Bitte erneut anmelden.',true)}});
window.addEventListener('pageshow',async event=>{
 if(!event.persisted)return;
 if(localStorage.getItem(key)!==token){closeView();signedOut(Error('Konto gewechselt. Bitte erneut anmelden.'));return}
 generation++;closed=false;busy=false;controls(false);$('settings').hidden=true;message('Sicherheitsstatus wird neu geprüft …');
 try{await load();message(status.enabled?'Zwei-Faktor-Anmeldung ist aktiv.':'Die Einrichtung wurde unterbrochen. Bitte neu beginnen und den neu angezeigten QR-Code scannen.',false,status.enabled?null:'begin')}catch(error){if(!error.stale)signedOut(error)}
});
if(!token){$('state').textContent='Bitte melde dich zuerst mit deinem persönlichen Superadmin-Konto an.';$('sign-in').hidden=false;message('Anmeldung erforderlich.')}else load().then(()=>{if(status.setupAvailable||status.enabled)message('')}).catch(error=>{if(!error.stale)signedOut(error)});
