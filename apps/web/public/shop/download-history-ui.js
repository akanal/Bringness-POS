import {downloadHistoryFilters,validDownloadHistory} from './download-history-client.js';
import {setShopStatus,shopStatuses} from './status-view.js';
import {downloadReviewHref} from './download-review-view.js';
import {money} from './catalog.js';
import {shopDate} from './review-state.js';

export function mountDownloadHistory({host,getToken,request}){
 const d=host.ownerDocument,w=d.defaultView,make=(tag,text,cls)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const root=make('section',undefined,'download-history'),controls=make('div',undefined,'download-history-controls'),label=make('label','Status '),select=make('select'),refresh=make('button','Verlauf neu laden'),more=make('button','Weitere Vorgänge laden','outline'),note=make('p'),list=make('div',undefined,'download-history-list');
 select.setAttribute('aria-label','Kaufstatus filtern');for(const key of downloadHistoryFilters){const o=make('option',key==='all'?'Alle Vorgänge':shopStatuses[key].label);o.value=key;select.append(o);}label.append(select);controls.append(label,refresh);note.setAttribute('role','status');root.setAttribute('aria-busy','false');root.append(controls,note,list,more);host.replaceChildren(root);more.hidden=true;
 let items=[],cursor=null,scope=null,session=getToken(),serial=0,busy=false,controller=null,disposed=false,seen=new Set();
 const online=()=>w.navigator.onLine!==false;
 function update(){refresh.disabled=select.disabled=more.disabled=busy||!online();more.hidden=!cursor;}
 function clear(message='Bitte den Windows-Kaufverlauf ausdrücklich laden.'){
  serial++;controller?.abort();busy=false;items=[];cursor=null;scope=null;seen.clear();list.replaceChildren();root.setAttribute('aria-busy','false');setShopStatus(note,'warning',message);update();
 }
 function checkAccount(){if(getToken()!==session){session=getToken();clear('Das Konto hat gewechselt. Die bisherigen Vorgänge wurden entfernt. Bitte neu laden.');return false;}return true;}
 function render(){
  list.replaceChildren();for(const item of items){const card=make('article',undefined,'history-entry');card.append(setShopStatus(make('p'),item.status),make('h2','Bringness POS für Windows'),make('p','Erstellt: '+shopDate(item.createdAt),'muted'),make('p','Vorgangsnummer: '+item.id,'history-reference'));
   const amounts=make('dl',undefined,'download-totals');for(const [text,value]of [['Netto · einmalig',item.netCents],['Umsatzsteuer 19 %',item.vatCents],['Gesamt · einmalig',item.grossCents]])amounts.append(make('dt',text),make('dd',money(value)));card.append(amounts,make('p',item.paymentMode==='test'?'TEST-Vorgang · keine gültige Lizenz':'Gespeicherter Vorgang · Lizenzfreigabe weiterhin gesperrt','muted'));
   const link=make('a','Rechnungsdaten und Kaufstatus prüfen','button outline');link.href=downloadReviewHref(item.id);link.referrerPolicy='no-referrer';link.onclick=e=>{if(!checkAccount())e.preventDefault();};card.append(link);list.append(card);
  }
 }
 async function load(reset=false){
  if(busy||disposed)return;if(!checkAccount())return;if(reset){items=[];cursor=null;scope=null;seen.clear();list.replaceChildren();}
  if(!session){setShopStatus(note,'warning','Bitte zuerst mit deinem bestehenden Bringness-Konto anmelden.');update();return;}if(!online()){setShopStatus(note,'warning','Offline. Der Verlauf wird nicht automatisch geladen.');update();return;}
  const own=++serial,account=session,filter=select.value,after=cursor,abort=new AbortController();controller=abort;busy=true;root.setAttribute('aria-busy','true');update();setShopStatus(note,'checking','Windows-Kaufverlauf wird geladen …');
  const timer=w.setTimeout(()=>abort.abort(),15000),current=()=>!disposed&&root.isConnected&&serial===own&&getToken()===account;
  try{
   const page=await request({token:account,status:filter,cursor:after,signal:abort.signal});if(!current()||abort.signal.aborted)return;
   if(!validDownloadHistory(page)||page.status!==filter||page.nextCursor!==null&&seen.has(page.nextCursor)||page.items.some(item=>items.some(old=>old.id===item.id)))throw Error('INVALID_RESPONSE');
   if(scope&&scope!==page.scope){clear('Der Betrieb hat gewechselt. Bitte den Verlauf neu laden.');return;}
   scope=page.scope;items=[...items,...page.items];cursor=page.nextCursor;if(cursor)seen.add(cursor);render();setShopStatus(note,'draft',items.length?`${items.length} gespeicherte Vorgänge geladen. Status der zuletzt geladenen Seite: ${shopDate(page.checkedAt)}. Dies sind keine abgeschlossenen Käufe.`:'Keine gespeicherten Windows-Vorgänge für diesen Filter.');
  }catch(e){if(current()){
   const denied={UNAUTHORIZED:'Der Zugang ist abgelaufen. Bitte erneut mit deinem bestehenden Bringness-Konto anmelden.',FORBIDDEN:'Der Kaufverlauf ist nur für Inhaber und Administratoren verfügbar.',ACCOUNT_CHANGED:'Der Betrieb hat gewechselt. Bitte den Verlauf neu laden.'};
   if(denied[e.code||e.message])clear(denied[e.code||e.message]);else setShopStatus(note,'warning',items.length?'Weitere Vorgänge konnten nicht geladen werden. Bereits geladene Einträge bleiben erhalten; bitte erneut versuchen.':'Der Kaufverlauf ist derzeit nicht verfügbar. Bitte später erneut versuchen. Zahlung und Lizenzfreigabe bleiben gesperrt.');
  }}finally{w.clearTimeout(timer);if(!disposed&&!checkAccount())return;if(serial===own){busy=false;root.setAttribute('aria-busy','false');update();}}
 }
 refresh.onclick=()=>load(true);more.onclick=()=>{if(cursor)load(false);};select.onchange=()=>{clear();load(true);};
 const storage=e=>{if(e.key==='bringness-pos-token'||e.key===null){session=getToken();clear('Das Konto hat gewechselt. Bitte den Verlauf neu laden.');}},hidden=()=>{if(d.hidden)clear('Ansicht pausiert. Bitte den Verlauf erneut laden.');},offline=()=>clear('Offline. Die angezeigten Vorgänge wurden entfernt; es wird nichts automatisch geladen.'),reconnect=()=>{setShopStatus(note,'warning','Wieder verbunden. Bitte den Verlauf ausdrücklich neu laden.');update();};
 w.addEventListener('storage',storage);w.addEventListener('focus',checkAccount);w.addEventListener('beforeprint',checkAccount);d.addEventListener('visibilitychange',hidden);w.addEventListener('offline',offline);w.addEventListener('online',reconnect);
 function dispose(){if(disposed)return;disposed=true;serial++;controller?.abort();w.removeEventListener('storage',storage);w.removeEventListener('focus',checkAccount);w.removeEventListener('beforeprint',checkAccount);d.removeEventListener('visibilitychange',hidden);w.removeEventListener('offline',offline);w.removeEventListener('online',reconnect);observer.disconnect();root.replaceChildren();}
 const observer=new w.MutationObserver(()=>{if(!root.isConnected)dispose();});observer.observe(host,{childList:true});setShopStatus(note,'draft',session?'Bitte den Windows-Kaufverlauf ausdrücklich laden.':'Bitte zuerst mit deinem bestehenden Bringness-Konto anmelden.');update();return {root,dispose,clear};
}
