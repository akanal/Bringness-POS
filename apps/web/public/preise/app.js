const $=id=>document.getElementById(id);
const money=cents=>(cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const offerings=[
 {code:'pos_base_monthly',title:'Online-Grundkasse',intro:'Die normale Kasse für jede Branche, inklusive Cloud-TSE.',items:['34,99 € netto pro Monat','Artikel, Zahlungen und Belege','Cloud-TSE im Preis enthalten – LIVE-Aktivierung noch ausstehend','Zusatzmodule einzeln buchbar'],featured:true},
 {code:'table_management_monthly',title:'Tischsystem',intro:'Tische unabhängig von einem QR-System verwalten.',items:['9,99 € netto pro Monat','Für Online- und Download-Kasse','Voraussetzung für alle drei Bestellsysteme']},
 {code:'table_qr_monthly',title:'Tisch-QR-Bestellsystem',intro:'Speisekarte und Bestellung direkt am Tisch.',items:['29,99 € netto pro Monat','Tischsystem zusätzlich erforderlich: 9,99 € monatlich','Gesamt mit Tischsystem: 39,98 € zusätzlich zur Grundkasse']},
 {code:'counter_qr_monthly',title:'Tresen-System',intro:'QR-Bestellung mit Abholung am Tresen.',items:['29,99 € netto pro Monat','Tischsystem zusätzlich erforderlich: 9,99 € monatlich','Eigenständiges Bestellsystem']},
 {code:'center_monthly',title:'Center-System',intro:'Gemeinsamer Bestellbereich mit mehreren Betrieben.',items:['29,99 € netto pro Monat','Tischsystem zusätzlich erforderlich: 9,99 € monatlich','Getrennt vom Tisch-QR- und Tresen-System']},
 {code:'personnel_monthly',title:'Personalmanagement',intro:'Personal unabhängig von Tischen oder QR-Systemen zubuchen.',items:['9,99 € netto pro Monat','Mitarbeiter, Dienstzeiten und Dienstplanung']},
 {code:'kitchen_monthly',title:'Küche',intro:'Optionale Küchenansicht für die Gastronomie.',items:['9,99 € netto pro Monat','Nicht in der Grundkasse enthalten']},
 {code:'download_license',title:'Windows-Download',intro:'Normale Windows-Kasse für 399 € netto einmalig.',items:['Einmalige Grundlizenz','Alle Zusatzmodule zu denselben Monatspreisen buchbar','QR-Systeme setzen das Tischsystem voraus','Hardware-TSE separat; Integration und Freigabe ausstehend']}
];
let plans=new Map(),billingState=null,selected=null,selectedQuotedNet=null,accountMode='register',token=localStorage.getItem('bringness-pos-token'),downloadAccess=null;
async function request(path,options={}){const response=await fetch('/api/v1'+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Die Anfrage ist fehlgeschlagen.');return data}
function setMode(mode){accountMode=mode;$('registerMode').classList.toggle('active',mode==='register');$('loginMode').classList.toggle('active',mode==='login');$('nameLabel').hidden=mode!=='register';$('accountName').required=mode==='register';$('accountPassword').autocomplete=mode==='register'?'new-password':'current-password';const input=$("accountPassword"),isNew=mode==="register";if(isNew){input.minLength=6;input.pattern="(?=.*\\p{Lu})(?=.*\\p{Ll})(?=.*\\p{Nd})(?=.*[^\\p{L}\\p{N}\\s]).{6,128}";input.title="Mindestens 6 Zeichen, ein Gro\u00dfbuchstabe, ein Kleinbuchstabe, eine Zahl und ein Sonderzeichen (maximal 128 Zeichen)."}else{input.removeAttribute("minlength");input.removeAttribute("pattern");input.removeAttribute("title")}$("passwordRules").hidden=!isNew}
function planState(code){
  if(billingState){
    const state=(billingState.plans||[]).find(item=>item.code===code);
    if(state)return state;
  }
  if(code!=='pos_base_monthly'&&code!=='download_license')return {active:false,eligible:false,requires:['pos_base']};
  if(code==='table_qr_monthly')return {active:false,eligible:false,requires:['pos_base']};
  return {active:false,eligible:true,requires:[]};
}
function dependencyText(code,state){
  if(state.included)return 'Im gewählten Tarif enthalten';
  if(state.active)return 'Aktiv';
  if(state.eligible)return code==='download_license'?'Kauf möglich':'Jetzt buchbar';
  if(code==='restaurant_monthly')return 'Zuerst Online-Basis aktivieren';

  if(['table_qr_monthly','counter_qr_monthly','center_monthly'].includes(code))return 'Kassenlizenz und Tischsystem erforderlich';
  return 'Derzeit nicht buchbar';
}
function buttonText(code,state){
  if(state.active)return 'Bereits aktiv';
  if(!state.eligible){
    if(code==='restaurant_monthly')return 'Erst Online-Basis buchen';
    if(code==='table_qr_monthly')return 'Erst Kassenlizenz aktivieren';
    return 'Noch nicht buchbar';
  }
  return code==='download_license'?'Download-Lizenz kaufen':'Jetzt kaufen';
}
function card(offer){
  const plan=plans.get(offer.code);if(!plan)return '';
  const state=planState(offer.code),net=Math.round(Number(state.amount??plan.amount)*100),vat=Math.round(net*0.19),period=plan.billingType==='monthly'?'/ Monat':'einmalig';
  return '<article class="plan'+(!['pos_base_monthly','download_license'].includes(offer.code)?' module-plan':' base-plan')+(offer.featured?' featured':'')+(state.active?' active-plan':'')+'"><div class="eyebrow">'+(plan.billingType==='monthly'?'Monatlicher Tarif':'Einmaliger Kauf')+'</div><div class="plan-status '+(state.active?'is-active':state.eligible?'is-ready':'is-locked')+'">'+dependencyText(offer.code,state)+'</div><h3>'+offer.title+'</h3><div class="price">'+money(net)+' <small>netto '+period+'</small></div><div class="tax">zzgl. 19 % MwSt. ('+money(vat)+') · Gesamt '+money(net+vat)+'</div>'+(state.standardAmount!=null&&state.amount<state.standardAmount?'<p class="fine">Individuell vereinbarter Monatspreis für dieses Konto.</p>':'')+'<p>'+offer.intro+'</p><ul>'+offer.items.map(item=>'<li>'+item+'</li>').join('')+'</ul><button class="btn" type="button" data-plan="'+offer.code+'" '+((state.active||!state.eligible)?'disabled':'')+'>'+buttonText(offer.code,state)+'</button></article>';
}
function renderPlans(){
  $('onlinePlans').innerHTML=card(offerings.find(o=>o.code==='pos_base_monthly'))||'Tarife sind derzeit nicht verfügbar.';
  $('basicModulePlans').innerHTML=offerings.filter(o=>['table_management_monthly','personnel_monthly','kitchen_monthly'].includes(o.code)).map(card).join('');
  $('orderingModulePlans').innerHTML=offerings.filter(o=>['table_qr_monthly','counter_qr_monthly','center_monthly'].includes(o.code)).map(card).join('');
  $('downloadPlans').innerHTML=card(offerings.find(o=>o.code==='download_license'))||'Lizenz ist derzeit nicht verfügbar.';
  document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.plan)));
}
async function loadBillingStatus(){
  if(!token){billingState=null;return null}
  try{billingState=await request('/billing/status');return billingState}
  catch(error){if(/Nicht angemeldet/i.test(error.message)){token=null;localStorage.removeItem('bringness-pos-token')}billingState=null;return null}
}
async function loadPlans(){
  try{
    const data=await request('/billing/plans');
    plans=new Map((data.plans||[]).map(p=>[p.code,p]));
    await loadBillingStatus();
    renderPlans();
  }catch(error){$('onlinePlans').textContent='Preise konnten nicht geladen werden. Bitte versuche es später erneut.';$('downloadPlans').textContent=error.message}
}
function choose(code){
  const plan=plans.get(code),state=planState(code);if(!plan)return;if(!['pos_base_monthly','download_license'].includes(code)){location.assign('/pos/?view=lizenz');return;}
  if(state.active||!state.eligible)return;
  selected=code;const net=Math.round(Number(state.amount??plan.amount)*100),vat=Math.round(net*0.19);selectedQuotedNet=net;$('selection').textContent=plan.name+' · '+money(net)+' netto'+(plan.billingType==='monthly'?' pro Monat':' einmalig');$('checkoutSummary').textContent='Zu zahlen: '+money(net+vat)+' inkl. '+money(vat)+' MwSt.'+(plan.billingType==='monthly'?' pro Monat':' einmalig');$('purchaseMessage').textContent='';$('kaufen').hidden=false;$('kaufen').scrollIntoView({behavior:'smooth',block:'start'});syncAccount()}
async function syncAccount(){if(!token){$('accountFields').hidden=false;$('accountFields').querySelectorAll('input').forEach(input=>input.disabled=false);$('signedIn').hidden=true;return}try{const data=await request('/billing/profile');$('accountFields').hidden=true;$('accountFields').querySelectorAll('input').forEach(input=>input.disabled=true);$('signedIn').hidden=false;const p=data.profile||{};for(const [field,key] of [['company','company_name'],['contact','contact_name'],['street','street'],['postal','postal_code'],['city','city'],['country','country'],['vatId','vat_id']])if(p[key])$(field).value=p[key]}catch(error){token=null;localStorage.removeItem('bringness-pos-token');billingState=null;renderPlans();$('accountFields').hidden=false;$('accountFields').querySelectorAll('input').forEach(input=>input.disabled=false);$('signedIn').hidden=true}}
$('registerMode').onclick=()=>setMode('register');$('loginMode').onclick=()=>setMode('login');$('closePurchase').onclick=()=>{$('kaufen').hidden=true;selected=null};
$('purchaseForm').onsubmit=async event=>{event.preventDefault();if(!selected||!plans.has(selected))return;const button=$('checkoutButton');button.disabled=true;$('purchaseMessage').textContent='Dein Kauf wird vorbereitet …';try{if(!token){const data=await request('/auth/'+accountMode,{method:'POST',body:JSON.stringify({name:$('accountName').value.trim(),email:$('accountEmail').value.trim(),password:$('accountPassword').value})});token=data.token;localStorage.setItem('bringness-pos-token',token)}await loadBillingStatus();renderPlans();const state=planState(selected);const quotedNet=Math.round(Number(state.amount??plans.get(selected).amount)*100);if(quotedNet!==selectedQuotedNet){const tax=Math.round(quotedNet*0.19);selectedQuotedNet=quotedNet;$('selection').textContent=plans.get(selected).name+' · '+money(quotedNet)+' netto'+(plans.get(selected).billingType==='monthly'?' pro Monat':' einmalig');$('checkoutSummary').textContent='Zu zahlen: '+money(quotedNet+tax)+' inkl. '+money(tax)+' MwSt.'+(plans.get(selected).billingType==='monthly'?' pro Monat':' einmalig');throw new Error('Der individuelle Preis wurde aktualisiert. Bitte Betrag prüfen und erneut bestätigen.')}if(state.active)throw new Error('Dieses Modul ist bereits aktiv.');if(!state.eligible)throw new Error(dependencyText(selected,state)+'.');await request('/billing/profile',{method:'PUT',body:JSON.stringify({company_name:$('company').value.trim(),contact_name:$('contact').value.trim(),street:$('street').value.trim(),postal_code:$('postal').value.trim(),city:$('city').value.trim(),country:$('country').value.trim(),vat_id:$('vatId').value.trim()})});const payment=await request('/billing/checkout',{method:'POST',body:JSON.stringify({planCode:selected,expectedNetCents:selectedQuotedNet})});if(!payment.checkoutUrl||!/^https:\/\//.test(payment.checkoutUrl))throw new Error('Zahlungslink fehlt.');location.assign(payment.checkoutUrl)}catch(error){$('purchaseMessage').textContent=error.message;button.disabled=false;syncAccount()}};
if(new URLSearchParams(location.search).get('payment')==='return'){$('returnMessage').hidden=false;$('returnMessage').innerHTML='Du bist von der Zahlung zurückgekehrt. Die Lizenz wird nach bestätigter Zahlung aktiviert. Diese Seite prüft den Status automatisch. <a href="/pos/">Zur Online-Kasse</a>.';$('purchaseForm').hidden=true;$('kaufen').hidden=false}
loadPlans();

async function checkDownloadLicense(){
  if(!token)return false;
  try{
    const result=await request('/downloads/windows/access');
    if(result.allowed&&result.licenseActive&&result.release){
      downloadAccess=result;
      $('licensedDownload').hidden=false;
      $('downloadWindows').textContent='Windows-Kasse '+(result.release.version||'')+' herunterladen';
      if(new URLSearchParams(location.search).get('payment')==='return')$('returnMessage').textContent='Zahlung bestätigt: Deine Download-Lizenz ist aktiv und der Windows-Download ist freigeschaltet.';
      await loadBillingStatus();renderPlans();
      return true;
    }
  }catch(error){
    if(new URLSearchParams(location.search).get('payment')==='return')$('returnMessage').textContent=error.message;
  }
  return false;
}
checkDownloadLicense();
if(new URLSearchParams(location.search).get('payment')==='return'){
  let checks=0;
  const timer=setInterval(async()=>{if(++checks>24||await checkDownloadLicense())clearInterval(timer)},5000)
}

$('downloadWindows').onclick=async event=>{
  event.preventDefault();
  const button=$('downloadWindows');
  button.textContent='Download wird vorbereitet …';
  try{
    if(!token)throw Error('Bitte zuerst anmelden.');
    if(!downloadAccess)await checkDownloadLicense();
    if(!downloadAccess?.release?.protectedDownloadPath)throw Error('Die Download-Lizenz ist noch nicht freigeschaltet.');
    const response=await fetch(downloadAccess.release.protectedDownloadPath,{headers:{Authorization:'Bearer '+token}});
    if(!response.ok){const problem=await response.json().catch(()=>({}));throw Error(problem.error||'Download fehlgeschlagen')}
    const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;
    link.download='Bringness-POS-Setup-'+(downloadAccess.release.version||'current')+'.exe';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){alert(error.message)}finally{button.textContent=downloadAccess?.release?.version?'Windows-Kasse '+downloadAccess.release.version+' herunterladen':'Windows-Kasse herunterladen'}
};

