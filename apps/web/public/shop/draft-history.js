import {setShopStatus,draftStatusKey} from './status-view.js';
import {products,money} from './catalog.js';
import {shopDate,draftPhase} from './review-state.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function validDraftHistory(page){
 if(!page||page.version!==1||typeof page.scope!=='string'||!/^[0-9a-f]{64}$/.test(page.scope)||page.canPay!==false||page.canActivate!==false||page.checkoutConnected!==false||!Array.isArray(page.items)||page.items.length>10||!(page.nextCursor===null||(typeof page.nextCursor==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(page.nextCursor)))||(!page.items.length&&page.nextCursor!==null))return false;
 const seen=new Set();return page.items.every(item=>{
  if(!item||!uuid(item.id)||seen.has(item.id))return false;seen.add(item.id);const p=products.find(p=>p.id===item.productId&&p.period!==null);
  return p&&item.planCode===(p.id==='pos-online'?'pos_base_monthly':'download_license')&&item.period===p.period&&item.currency==='EUR'&&['draft','canceled'].includes(item.status)&&typeof item.expired==='boolean'&&Number.isFinite(Date.parse(item.createdAt))&&Number.isFinite(Date.parse(item.expiresAt))&&Date.parse(item.expiresAt)>Date.parse(item.createdAt)&&['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(item[k])&&item[k]>=0&&item[k]<=2147483647)&&item.netCents>0&&item.netCents+item.vatCents===item.grossCents&&Math.round(item.netCents*19/100)===item.vatCents;
 });
}
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
export function mountDraftHistory({dialog,host,token,request,onOpenDraft}){
 const refresh=node('button','Neu laden','outline'),more=node('button','Weitere Entwürfe laden','outline'),status=node('p'),list=node('div',undefined,'draft-history-list');
 refresh.type=more.type='button';status.setAttribute('role','status');host.replaceChildren(refresh,status,list,more);more.hidden=true;
 let items=[],cursor=null,loadedSession=null,loadedScope=null,busy=false,controller,serial=0;
 function clear(message='Verlauf erneut laden.'){
  serial++;controller?.abort();items=[];cursor=null;loadedSession=null;loadedScope=null;busy=false;list.replaceChildren();status.textContent=message;more.hidden=true;refresh.disabled=false;host.setAttribute('aria-busy','false');
 }
 function render(){list.replaceChildren();for(const item of items){
  const p=products.find(p=>p.id===item.productId),entry=node('article',undefined,'history-entry');
  entry.append(setShopStatus(node('p',undefined,'history-phase'),draftStatusKey(item),draftPhase(item)),node('h3',p.name),node('p','Erstellt: '+shopDate(item.createdAt),'muted'),node('p',`${money(item.netCents)} netto · ${money(item.grossCents)} brutto ${item.period==='monthly'?'monatlich':'einmalig'}`),node('p','Entwurfsnummer: '+item.id,'history-reference'));
  const open=node('button','Entwurf ansehen','outline');open.type='button';open.onclick=()=>{if(token()!==loadedSession){clear('Das Konto hat gewechselt. Bitte den Verlauf neu laden.');return;}onOpenDraft(item.id,loadedSession);};entry.append(open);list.append(entry);
 }more.hidden=!cursor;}
 async function load(reset=false){
  if(busy)return;const session=token();if(reset||session!==loadedSession){items=[];cursor=null;loadedScope=null;list.replaceChildren();more.hidden=true;loadedSession=session;}
  if(!session){status.textContent='Bitte zuerst mit deinem bestehenden Bringness-Konto anmelden.';return;}
  if(window.navigator.onLine===false){status.textContent='Du bist offline. Der Verlauf benötigt eine Verbindung. Es wird nichts automatisch erneut geladen.';return;}
  const own=++serial,after=cursor,abort=new AbortController();controller=abort;busy=true;refresh.disabled=more.disabled=true;host.setAttribute('aria-busy','true');status.textContent='Entwurfsverlauf wird geladen …';
  const timer=window.setTimeout(()=>abort.abort(),15000),current=()=>serial===own&&dialog.open&&token()===session;
  try{
   const page=await request('drafts/history'+(after?'?cursor='+encodeURIComponent(after):''),{session,signal:abort.signal});
   if(!current()||abort.signal.aborted){if(serial===own&&dialog.open&&token()!==session)clear('Das Konto hat gewechselt. Bitte den Verlauf neu laden.');return;}
   if(!validDraftHistory(page))throw Error('INVALID_RESPONSE');if(loadedScope&&page.scope!==loadedScope){clear('Der Betrieb hat gewechselt. Bitte den Verlauf neu laden.');return;}
   if(page.nextCursor===after&&after!==null||page.items.some(item=>items.some(old=>old.id===item.id)))throw Error('INVALID_RESPONSE');
   loadedScope=page.scope;items=[...items,...page.items];cursor=page.nextCursor;render();status.textContent=items.length?`${items.length} Entwürfe geladen. Entwürfe sind keine abgeschlossenen Bestellungen.`:'Noch keine gespeicherten Entwürfe für diesen Betrieb.';
  }catch(e){
   if(current()){
    const denied={ACCOUNT_CHANGED:'Der Betrieb hat gewechselt. Bitte den Verlauf neu laden.',UNAUTHORIZED:'Dein Zugang ist abgelaufen. Bitte erneut im bestehenden Bringness-Konto anmelden.',FORBIDDEN:'Der Verlauf ist nur für Inhaber und Administratoren verfügbar.'};
    if(denied[e.message])clear(denied[e.message]);else status.textContent='Der Verlauf konnte nicht vollständig geladen werden. Bitte erneut versuchen. Bereits geladene Einträge bleiben erhalten.';
   }else if(serial===own&&dialog.open&&token()!==session)clear('Das Konto hat gewechselt. Bitte den Verlauf neu laden.');
  }
  finally{window.clearTimeout(timer);if(serial===own){busy=false;refresh.disabled=more.disabled=false;host.setAttribute('aria-busy','false');}}
 }
 refresh.onclick=()=>load(true);more.onclick=()=>load(false);dialog.addEventListener('close',()=>clear());
 return {open(){clear('Entwurfsverlauf wird geladen …');return load(true);},clear};
}
