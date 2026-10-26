import {checkoutUuid,checkoutStatuses} from './checkout-state.js';
const host=document.querySelector('#payment-host'),key='bringness-pos-token';
const id=location.hash.slice(1),valid=checkoutUuid(id)&&!location.search&&window.top===window.self;
const make=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const note=make('p',valid?'Lade deinen gespeicherten Vorgang ausdrücklich über die Schaltfläche.':'Bitte die Zahlung über einen gültigen Shop-Vorgang öffnen.');note.setAttribute('role','status');
const result=make('div',''),load=make('button','Vorgang laden');host.append(note,load,result);load.disabled=!valid;
let serial=0,abort=null,busy=false,account=null,consentDigest=null;
const token=()=>localStorage.getItem(key)||'';
function clear(message){serial++;abort?.abort();busy=false;account=null;consentDigest=null;result.replaceChildren();note.textContent=message;load.disabled=!valid||navigator.onLine===false;}
function available(session){try{return valid&&document.visibilityState!=='hidden'&&navigator.onLine!==false&&token()===session;}catch{return false;}}
function button(text,action){const b=make('button',text);b.onclick=()=>run(action);return b;}
function render(value){
 if(value.id!==id||value.mode!=='test'||!Object.hasOwn(checkoutStatuses,value.status)||typeof value.canStart!=='boolean'||typeof value.canRefresh!=='boolean'||value.canActivate!==false||value.invoiceIssued!==false)throw Error();
 const p=value.product;if(!p||!['pos-online','pos-download'].includes(p.productId)||p.currency!=='EUR'||!['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)||p.netCents+p.vatCents!==p.grossCents)throw Error();
 const money=n=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n/100);
 result.replaceChildren(make('h2',p.productId==='pos-online'?'Bringness Online':'Bringness Windows'),make('p',checkoutStatuses[value.status].title),make('p',`${money(p.netCents)} netto + ${money(p.vatCents)} Umsatzsteuer = ${money(p.grossCents)}${p.period==='monthly'?' monatlich':' einmalig'}`));
 if(value.canStart){
  if(p.productId==='pos-download')result.append(make('p','Vor der Windows-Zahlung bitte die Rechnungsdaten öffnen und den elektronischen PDF-Empfang bestätigen.'),button('Rechnungsdaten und PDF-Zustimmung öffnen','consent'));
  result.append(make('p','Mit dem nächsten Schritt wird eine TEST-Zahlung mit den angezeigten Beträgen vorbereitet.'),button('TEST-Zahlung vorbereiten','start'));
 }
 if(value.checkoutUrl){
  const u=new URL(value.checkoutUrl);if(value.status!=='open'||u.protocol!=='https:'||!['www.mollie.com','checkout.mollie.com'].includes(u.hostname)||u.username||u.password||u.port||u.hash)throw Error();
  const link=make('a','Bei Mollie im TEST-Modus fortfahren');link.href=u.href;link.referrerPolicy='no-referrer';link.onclick=e=>{if(busy||!available(account))e.preventDefault();};result.append(link);
 }
 if(value.canRefresh)result.append(button('Zahlungsstatus bei Mollie prüfen','refresh'));
 const review=make('a','Rechnungsdaten und Kaufstatus');review.href='./download-review.html#'+id;if(p.productId==='pos-download')result.append(review);
}
function renderConsent(value){
 if(value.id!==id||value.version!=='pdf-domestic-b2b-v1'||typeof value.text!=='string'||!value.text||value.text.length>1000||!/^[a-f0-9]{64}$/.test(value.digest)||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now())throw Error();
 const seller=value.seller,buyer=value.buyer,p=value.product;
 if(!seller||!buyer||p?.productId!=='pos-download'||p.currency!=='EUR')throw Error();
 const lines=(object,keys)=>keys.map(k=>{if(typeof object[k]!=='string'||object[k].length>500)throw Error();return object[k];}).join(', ');
 result.replaceChildren(make('h2','Rechnungsdaten bestätigen'),make('p','Aussteller: '+lines(seller,['name','street','postalCode','city','country','taxId'])),make('p','Rechnungsempfänger: '+lines(buyer,['company_name','street','postal_code','city','country'])));
 if(!['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)||p.netCents+p.vatCents!==p.grossCents)throw Error();
 const money=n=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n/100);
 result.append(make('p',`${money(p.netCents)} netto + ${money(p.vatCents)} Umsatzsteuer = ${money(p.grossCents)} einmalig`));
 consentDigest=value.digest;
 const label=make('label',''),checkbox=document.createElement('input');checkbox.type='checkbox';label.append(checkbox,document.createTextNode(value.text));
 const accept=button('PDF-Empfang bestätigen','accept');accept.disabled=true;checkbox.onchange=()=>{accept.disabled=!checkbox.checked||Date.parse(value.expiresAt)<=Date.now();};
 result.append(label,accept,make('p','Die Zustimmung allein startet keine Zahlung.'));
}
async function run(action){
 if(busy||!valid)return;let session;try{session=token();}catch{clear('Der Kontozugang ist nicht verfügbar. Bitte erneut anmelden.');return;}
 if(!session||!available(session)){clear('Bitte anmelden und den Vorgang online erneut laden.');return;}
 if(action&&account!==session){clear('Das Konto hat gewechselt. Bitte erneut laden.');return;}
 const digest=consentDigest;if(action==='accept'&&!digest)return;
 const own=++serial;abort=new AbortController();const controller=abort;busy=true;load.disabled=true;result.replaceChildren();note.textContent='Anfrage läuft …';
 const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const consent=action==='consent'||action==='accept',post=Boolean(action)&&action!=='consent';
  const path=consent?'/api/v1/shop/downloads/'+id+'/consent':'/api/v1/shop/payment-sessions/'+id+(action?'/'+action:'');
  const response=await fetch(path,{method:post?'POST':'GET',headers:{Authorization:'Bearer '+session,...(post?{'Content-Type':'application/json'}:{})},...(post?{body:action==='accept'?JSON.stringify({accepted:true,acceptedDigest:digest}):'{}'}:{}),cache:'no-store',credentials:'omit',mode:'same-origin',redirect:'error',signal:controller.signal});
  if(!response.ok)throw Error();const value=await response.json();
  if(own!==serial||controller.signal.aborted||!available(session))return;
  account=session;
  if(action==='consent'){renderConsent(value);note.textContent='Bitte Aussteller, Empfänger und PDF-Empfang prüfen.';}
  else if(action==='accept'){if(value.id!==id||value.recorded!==true)throw Error();consentDigest=null;note.textContent='PDF-Empfang gespeichert. Lade den Vorgang erneut, um mit der TEST-Zahlung fortzufahren.';}
  else{consentDigest=null;render(value);note.textContent='Gespeicherten Vorgang geladen. TEST-Betrieb.';}
 }catch{if(own===serial){result.replaceChildren();note.textContent=action==='start'?'Die Antwort ist unklar. Lade zuerst den gespeicherten Vorgang erneut; starte keine zweite Zahlung.':'Der Vorgang ist derzeit nicht verfügbar. Bitte Konto prüfen und ausdrücklich erneut laden.';}}
 finally{clearTimeout(timer);if(own===serial){busy=false;load.disabled=!valid||navigator.onLine===false;}}
}
load.onclick=()=>run();
addEventListener('storage',e=>{if(e.key===key||e.key===null)clear('Das Konto hat gewechselt. Bitte erneut laden.');});
addEventListener('offline',()=>clear('Offline. Bitte später erneut laden.'));
addEventListener('online',()=>clear('Verbindung wieder verfügbar. Bitte den Vorgang ausdrücklich erneut laden.'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')clear('Bitte den Vorgang erneut laden.');});
addEventListener('focus',()=>{try{if(account&&account!==token())clear('Das Konto hat gewechselt. Bitte erneut laden.');}catch{clear('Kontozugang nicht verfügbar.');}});
addEventListener('pagehide',()=>clear(''));
