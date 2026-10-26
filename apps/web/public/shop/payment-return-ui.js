import {helpHrefForStatus} from './help-content.js';
import {setShopStatus} from './status-view.js';
import {checkoutStatuses} from './checkout-state.js';
import {validPaymentReturnOrder} from './payment-return-state.js';
import {downloadReviewHref} from './download-review-view.js';
import {money} from './catalog.js';
export function mountPaymentReturn({host,id,getToken,request}){
 const d=host.ownerDocument,w=d.defaultView,make=(tag,text,cls)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const root=make('section',undefined,'payment-return'),button=make('button','Gespeicherten Status prüfen'),notice=make('p'),result=make('div');notice.setAttribute('role','status');root.setAttribute('aria-busy','false');root.append(make('h2','Rückkehrstatus prüfen'),notice,button,result);host.replaceChildren(root);
 let account=getToken(),serial=0,busy=false,controller=null,disposed=false;
 const online=()=>w.navigator.onLine!==false;
 const update=()=>{button.disabled=busy||!online();for(const b of result.querySelectorAll('button'))b.disabled=busy||!online();};
 function clear(message){serial++;controller?.abort();busy=false;result.replaceChildren();root.setAttribute('aria-busy','false');setShopStatus(notice,'warning',message);update();}
 function checkAccount(){if(account!==getToken()){account=getToken();clear('Das Konto hat gewechselt. Der bisherige Status wurde entfernt. Bitte erneut prüfen.');return false;}return true;}
 function render(order){
  const s=order.snapshot;result.replaceChildren(setShopStatus(make('h3'),order.status),make('p',checkoutStatuses[order.status].detail),make('h3',s.productId==='pos-download'?'Bringness POS für Windows':'Bringness POS Online'));
  const label=make('label','Vorgangsnummer'),input=make('input'),copy=make('button','Vorgangsnummer kopieren','outline'),copied=make('p',undefined,'muted');input.readOnly=true;input.value=order.id;input.className='record-reference';input.setAttribute('aria-label','Vorgangsnummer');label.append(input);copied.setAttribute('role','status');result.append(label,copy,copied);
  copy.onclick=async()=>{if(busy||!checkAccount())return;const own=serial;input.focus();input.select();try{if(!w.navigator.clipboard?.writeText)throw Error();await w.navigator.clipboard.writeText(order.id);if(own===serial&&checkAccount()&&input.isConnected)copied.textContent='Vorgangsnummer kopiert.';}catch{if(own===serial&&checkAccount()&&input.isConnected)copied.textContent='Vorgangsnummer markiert. Bitte über die Kopierfunktion deines Geräts kopieren.';}};
  const amounts=make('dl',undefined,'download-totals');for(const [text,cents]of [['Netto',s.netCents],['Umsatzsteuer 19 %',s.vatCents],['Gesamt',s.grossCents]])amounts.append(make('dt',text),make('dd',money(cents)));result.append(make('p',s.period==='monthly'?'Gespeicherte Abrechnung: monatlich':'Gespeicherte Abrechnung: einmalig'),amounts);
  result.append(make('p','Dies ist der aufgezeichnete Status dieses Vorgangs, keine neue Anbieterprüfung. Die Rückkehradresse bestätigt weder Zahlung noch Lizenzfreigabe.','muted'));
  const links=make('div',undefined,'payment-return-actions');
  if(s.productId==='pos-download'){const review=make('a','Rechnungsdaten und Kaufstatus prüfen','button outline');review.href=downloadReviewHref(order.id);links.append(review);const history=make('a','Windows-Kaufverlauf öffnen','button outline');history.href='/shop/download-history.html';links.append(history);}
  else result.append(make('p','Diese Rückkehrseite richtet kein Abonnement ein und verändert keine bestehende Lizenz. Bitte den bestehenden Kontobereich für weitere Prüfungen öffnen.'));
  const accountLink=make('a','Im Shop anmelden','button outline');accountLink.href='/shop/account.html';links.append(accountLink);const allHistory=make('a','Alle Shop-Vorgänge öffnen','button outline');allHistory.href='/shop/order-history.html';links.append(allHistory);for(const a of links.querySelectorAll('a')){a.referrerPolicy='no-referrer';a.onclick=e=>{if(!checkAccount())e.preventDefault();};}result.append(links);const help=make('a','Hilfe zu diesem Status');help.href=helpHrefForStatus(order.status);help.referrerPolicy='no-referrer';result.append(help);
 }
 async function load(){
  if(busy||disposed||!checkAccount())return;if(!account){setShopStatus(notice,'warning','Bitte zuerst mit deinem bestehenden Bringness-Konto anmelden. Die Rückkehrnummer allein gewährt keinen Zugriff.');return;}if(!online()){setShopStatus(notice,'warning','Offline. Bitte später den gespeicherten Status ausdrücklich erneut prüfen.');return;}
  const own=++serial,session=account,abort=new AbortController();controller=abort;busy=true;root.setAttribute('aria-busy','true');update();setShopStatus(notice,'checking','Gespeicherter Vorgang wird gelesen …');
  const timer=w.setTimeout(()=>abort.abort(),15000),current=()=>!disposed&&root.isConnected&&serial===own&&getToken()===session;
  try{const order=await request({id,token:session,signal:abort.signal});if(!current()||abort.signal.aborted)return;if(!validPaymentReturnOrder(order,id))throw Error('INVALID_RESPONSE');render(order);setShopStatus(notice,'warning','Gespeicherten Status geladen. Keine neue Zahlung, kein Abonnement und keine Lizenzfreigabe durch diese Seite.');}
  catch(e){if(current()){
   const denied={UNAUTHORIZED:'Der Zugang ist abgelaufen. Bitte erneut mit deinem bestehenden Bringness-Konto anmelden.',FORBIDDEN:'Die Statusprüfung ist nur für berechtigte Inhaber und Administratoren verfügbar.',CHECKOUT_NOT_FOUND:'Für dieses Konto wurde kein passender Vorgang gefunden.',ACCOUNT_CHANGED:'Der Betrieb hat gewechselt. Bitte den Vorgang erneut prüfen.'};
   if(denied[e.code||e.message])clear(denied[e.code||e.message]);else setShopStatus(notice,'warning',result.childElementCount?'Die erneute Prüfung ist ausgeblieben. Der zuvor geladene Status bleibt als älterer Stand sichtbar; bitte später erneut prüfen.':'Die Prüfung ist derzeit nicht verfügbar. Die Rückkehrdaten sind kein Zahlungsnachweis. Bitte später erneut versuchen.');
  }}finally{w.clearTimeout(timer);if(!disposed&&!checkAccount())return;if(serial===own){busy=false;root.setAttribute('aria-busy','false');update();}}
 }
 button.onclick=load;
 const storage=e=>{if(e.key==='bringness-pos-token'||e.key===null){account=getToken();clear('Das Konto hat gewechselt. Bitte den gespeicherten Status erneut prüfen.');}},hidden=()=>{if(d.hidden)clear('Ansicht pausiert. Bitte den gespeicherten Vorgang erneut prüfen.');},offline=()=>clear('Offline. Die Statusanzeige wurde entfernt; es wird nichts automatisch gesendet.'),reconnect=()=>{setShopStatus(notice,'warning','Wieder verbunden. Bitte den Status ausdrücklich erneut prüfen.');update();};
 w.addEventListener('storage',storage);w.addEventListener('focus',checkAccount);w.addEventListener('beforeprint',checkAccount);d.addEventListener('visibilitychange',hidden);w.addEventListener('offline',offline);w.addEventListener('online',reconnect);
 function dispose(){if(disposed)return;disposed=true;serial++;controller?.abort();w.removeEventListener('storage',storage);w.removeEventListener('focus',checkAccount);w.removeEventListener('beforeprint',checkAccount);d.removeEventListener('visibilitychange',hidden);w.removeEventListener('offline',offline);w.removeEventListener('online',reconnect);observer.disconnect();root.replaceChildren();}
 const observer=new w.MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(host,{childList:true});setShopStatus(notice,'draft',account?'Bitte den gespeicherten Status ausdrücklich prüfen. Aus der Rückkehradresse wird kein Zahlungsstatus übernommen.':'Bitte zuerst mit deinem bestehenden Bringness-Konto anmelden.');update();return {root,dispose,clear};
}
