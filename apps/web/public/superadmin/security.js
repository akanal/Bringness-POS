const $=id=>document.getElementById(id),from=new URLSearchParams(location.search).get('from')||'market';
const sources={market:['bringness-market-admin-token','/superadmin/','market'],pos:['bringness-pos-token','/admin/','pos'],systems:['bringness-pos-admin-token','/admin/systems.html','pos'],ai:['bringness-pos-token','/admin/ai-workspace.html?admin=1','ai']};
const [key,back,theme]=sources[from]||sources.market,token=localStorage.getItem(key);let pending=null,status=null,busy=false,closed=false;
document.querySelector('header').dataset.adminProduct=theme;$('back').href=back;$('sign-in').href=back;
const message=(text,bad=false)=>{$('message').textContent=text;$('message').dataset.error=String(bad)};
async function api(action,body){if(closed)throw Error('Bitte diese Seite neu laden.');const response=await fetch('/api/v1/platform/security/'+action,{method:body?'POST':'GET',credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'Die Sicherheitseinstellungen sind gerade nicht erreichbar.');return data}
function wipe(){$('loginForm').reset();pending=null;$('manual-key').value='';$('qr').removeAttribute('src');$('recovery-codes').value='';$('activation-code').value='';$('disable-code').value='';$('saved').checked=false;$('confirm-disable').checked=false;$('loginForm').elements.password.value='';$('enrollment').hidden=true}
function paint(){
 $('settings').hidden=false;$('sign-in').hidden=true;$('state').textContent=status.enabled?'Aktiv – neue Anmeldungen benötigen dein Passwort und einen Handy- oder Wiederherstellungscode.':'Noch nicht aktiviert. Deine bestehende Anmeldung bleibt bis zur erfolgreichen Einrichtung unverändert.';
 $('remaining').hidden=!status.enabled;$('remaining').textContent=status.recoveryRemaining+' Wiederherstellungscodes übrig.';
 $('form-title').textContent=status.enabled?'Sicherheit verwalten':'Authenticator einrichten';$('intro').hidden=status.enabled;$('begin').hidden=status.enabled||Boolean(pending);$('begin').disabled=busy||!status.setupAvailable;$('disable-section').hidden=!status.enabled;$('recent-recovery').hidden=!status.recentRecovery;
 if(!status.setupAvailable&&!status.enabled)message('Die geschützte Serverkonfiguration ist noch nicht verfügbar.',true)
}
async function load(){status=await api('status');paint()}
$('restart').onclick=()=>{wipe();paint();message('Bitte die Einrichtung mit deinem aktuellen Passwort neu beginnen.')};
$('save-codes').onclick=()=>{if(!pending)return;const blob=new Blob(['Bringness – einmalige Wiederherstellungscodes\n\n'+$('recovery-codes').value+'\n\nGetrennt vom Handy sicher aufbewahren.\n'],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Bringness-Wiederherstellungscodes.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('loginForm').onsubmit=async event=>{
 event.preventDefault();if(busy||closed)return;const action=status?.enabled?'disable':pending?'activate':'begin',password=$('loginForm').elements.password.value;
 busy=true;for(const b of $('loginForm').querySelectorAll('button'))b.disabled=true;message('Wird geprüft …');
 try{
  if(action==='begin'){
   const data=await api('begin',{password});if(closed)return;pending={enrollment:data.enrollment};$('qr').src=data.qr;$('manual-key').value=data.secret;$('recovery-codes').value=data.recoveryCodes.join('\n');$('enrollment').hidden=false;paint();message('QR-Code scannen, Wiederherstellungscodes speichern und den Handy-Code bestätigen.');$('qr').scrollIntoView({block:'start',behavior:'smooth'});
  }else if(action==='activate'){
   if(!$('saved').checked)throw Error('Bitte zuerst die Wiederherstellungscodes sicher speichern.');
   await api('activate',{password,enrollment:pending.enrollment,code:$('activation-code').value.trim(),saved:true});wipe();await load();message('Zwei-Faktor-Anmeldung ist aktiv. Deine anderen Sitzungen wurden abgemeldet.');
  }else{
   await api('disable',{password,code:$('disable-code').value.trim(),confirm:$('confirm-disable').checked});wipe();await load();message('Zwei-Faktor-Anmeldung deaktiviert. Du kannst den Authenticator jetzt neu einrichten.');
  }
 }catch(error){
  // An interrupted activation can have succeeded; check before offering another write.
  if(action==='activate'){try{const current=await api('status');if(current.enabled){wipe();status=current;paint();message('Zwei-Faktor-Anmeldung ist aktiv.');return}}catch{}}
  message(error.message,true);
 }finally{busy=false;for(const b of $('loginForm').querySelectorAll('button'))b.disabled=false;if(status)paint()}
};
window.addEventListener('pagehide',()=>{closed=true;wipe()});window.addEventListener('storage',event=>{if((event.key===key||event.key===null)&&localStorage.getItem(key)!==token){closed=true;wipe();$('settings').hidden=true;$('sign-in').hidden=false;message('Konto gewechselt. Bitte erneut anmelden.',true)}});
if(!token){$('state').textContent='Bitte melde dich zuerst mit deinem persönlichen Superadmin-Konto an.';$('sign-in').hidden=false;message('Anmeldung erforderlich.')}else load().then(()=>{if(status.setupAvailable||status.enabled)message('')}).catch(error=>{$('settings').hidden=true;$('state').textContent='Die persönlichen Sicherheitseinstellungen sind nicht geöffnet.';$('sign-in').hidden=false;message(error.message,true)});
