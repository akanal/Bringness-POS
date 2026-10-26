import {setShopStatus} from './status-view.js';
import {checkoutStatuses,checkoutUuid,validCheckoutReference,draftCanPrepare} from './checkout-state.js';
import {sessionStore} from './navigation.js';
import {mountReferenceField} from './reference-field.js';
import {downloadReviewHref} from './download-review-view.js';
export function validCheckout(order,draft){
 const l=draft?.snapshot?.lines?.[0],s=order?.snapshot;
 if(!l||!s||!checkoutUuid(draft.id)||l.quantity!==1||!['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(l[k])&&l[k]>=0&&l[k]<=2147483647)||l.netCents<=0||l.netCents+l.vatCents!==l.grossCents||Math.round(l.netCents*19/100)!==l.vatCents)return false;
 const plan=l.productId==='pos-online'?'pos_base_monthly':l.productId==='pos-download'?'download_license':null;
 return Boolean(plan&&l.planCode===plan&&l.period===(l.productId==='pos-online'?'monthly':'once')&&order.version===1&&checkoutUuid(order.id)&&checkoutUuid(order.requestId)&&order.draftId===draft.id&&Object.hasOwn(checkoutStatuses,order.status)&&order.canPay===false&&order.canActivate===false&&order.checkoutConnected===false&&s.currency==='EUR'&&['productId','planCode','period','netCents','vatCents','grossCents'].every(k=>s[k]===l[k]));
}
export function mountCheckout({draft,host,run,request,fingerprint,money,onAbandoned}){
 const create=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const root=create('section');root.className='checkout-recovery';host.append(root);
 const heading=create('h3','Zahlungsvorbereitung · noch keine Zahlung'),info=create('p','Der Betrag wird nochmals auf dem Server geprüft. Das Speichern reserviert die Buchung; es wird kein Zahlungsanbieter aufgerufen.');
 const prepare=create('button','Betrag bestätigen und Vorbereitung speichern');prepare.id='checkout-prepare';
 const refresh=create('button','Vorbereitung wiederfinden');refresh.className='outline';refresh.id='checkout-refresh';
 const expiry=create('p');expiry.className='muted';expiry.id='checkout-expiry';
 const output=create('div');output.id='checkout-result';output.setAttribute('role','status');root.append(heading,info,prepare,refresh,expiry,output);
 const key=`bringness.shop.checkout.v2:${draft.id}`,storage=sessionStore(window);
 function lockPreparation(){prepare.disabled=true;prepare.dataset.locked='true';}
 function expire(){if(!root.isConnected)return;lockPreparation();setShopStatus(expiry,'expired','Der Entwurf ist abgelaufen. Eine neue Vorbereitung ist gesperrt; den vorhandenen Status kannst du weiter abrufen.');}
 if(!draftCanPrepare(draft))expire();
 else {const timer=window.setTimeout(expire,Math.min(2147483647,Math.max(0,Date.parse(draft.expiresAt)-Date.now())));const observer=new window.MutationObserver(()=>{if(!root.isConnected){window.clearTimeout(timer);observer.disconnect();}});observer.observe(host,{childList:true});}
 function display(o){
  if(!validCheckout(o,draft))throw Error('INVALID_RESPONSE');lockPreparation();const status=checkoutStatuses[o.status];
  output.replaceChildren(setShopStatus(create('h4'),o.status,status.title),create('p',status.detail),create('p',`Nummer: ${o.id}`));
  mountReferenceField(output,{value:o.id,label:'Vorgangsnummer'});
  const amounts=create('dl');amounts.className='checkout-amounts';
  for(const [label,value]of [['Netto',o.snapshot.netCents],['19 % MwSt.',o.snapshot.vatCents],['Brutto',o.snapshot.grossCents]])amounts.append(create('dt',label),create('dd',money(value)));
  output.append(create('p',o.snapshot.period==='monthly'?'Abrechnung: monatlich':'Abrechnung: einmalig'),amounts,create('p','Zahlung und Lizenzaktivierung bleiben in dieser Shop-Vorschau gesperrt.'));
  if(['prepared','open','uncertain','paid'].includes(o.status)){const payment=create('a','Zahlungsvorgang im TEST-Bereich öffnen');payment.href='/shop/payment.html#'+o.id;payment.className='button outline';payment.referrerPolicy='no-referrer';output.append(payment);}
  if(o.snapshot.productId==='pos-download'){const link=create('a','Rechnungsdaten und Kaufstatus prüfen');link.href=downloadReviewHref(o.id);link.className='button outline';link.referrerPolicy='no-referrer';output.append(link);}
  output.firstElementChild.scrollIntoView?.({block:'center'});
  if(o.status!=='prepared')return;
  const confirmation=create('div');confirmation.className='checkout-confirmation';confirmation.hidden=true;
  const abandon=create('button','Vorbereitung verwerfen');abandon.className='action-danger';
  const confirm=create('button','Verwerfen bestätigen');confirm.className='action-danger';const back=create('button','Behalten');back.className='outline';
  confirmation.append(create('p','Nur die noch nicht übermittelte Vorbereitung wird verworfen. Der Server prüft den aktuellen Zustand erneut.'),confirm,back);output.append(abandon,confirmation);
  abandon.onclick=()=>{confirmation.hidden=false;confirm.focus();};back.onclick=()=>{confirmation.hidden=true;abandon.focus();};
  confirm.onclick=()=>run(async ctx=>{
   const canceled=await request(`checkouts/${o.id}/cancel`,{method:'POST',body:{},...ctx});if(!ctx.current())return;
   if(!validCheckout(canceled,draft)||canceled.id!==o.id||canceled.status!=='canceled')throw Error('INVALID_RESPONSE');
   const updated=await request(`drafts/${draft.id}`,ctx);if(!ctx.current())return;
   if(updated.id!==draft.id||updated.requestId!==draft.requestId||updated.status!=='canceled')throw Error('INVALID_RESPONSE');
   onAbandoned(updated);
  });
 }
 async function recover(ctx,createNew){
  output.replaceChildren(setShopStatus(create('p'),'checking','Vorbereitung wird geprüft …'));
  try{const found=await request(`checkouts/drafts/${draft.id}`,ctx);if(ctx.current())display(found);return;}catch(e){if(e.message!=='CHECKOUT_NOT_FOUND'||!createNew)throw e;}
  if(!draftCanPrepare(draft)){expire();throw Error('DRAFT_INELIGIBLE');}
  const hash=await fingerprint(ctx.session);if(!ctx.current())return;
  let raw;try{raw=storage.getItem(key);}catch{throw Error('STORAGE_UNAVAILABLE');}
  let ref;if(raw!==null){try{ref=JSON.parse(raw);}catch{throw Error('INVALID_CHECKOUT_REFERENCE');}validCheckoutReference(ref,hash);}
  else {ref={version:1,requestId:crypto.randomUUID(),sessionHash:hash};try{storage.setItem(key,JSON.stringify(ref));}catch{throw Error('STORAGE_UNAVAILABLE');}}
  if(!draftCanPrepare(draft)){expire();throw Error('DRAFT_INELIGIBLE');}
  const l=draft.snapshot.lines[0];const value=await request('checkouts',{method:'POST',body:{draftId:draft.id,requestId:ref.requestId,acceptedNetCents:l.netCents,acceptedGrossCents:l.grossCents},...ctx});
  if(ctx.current()){if(value.requestId!==ref.requestId)throw Error('INVALID_RESPONSE');display(value);}
 }
 const invoke=createNew=>run(async ctx=>{try{await recover(ctx,createNew);}catch(e){if(ctx.current())output.replaceChildren(setShopStatus(create('p'),'uncertain','Die Prüfung wurde nicht abgeschlossen. Bitte „Vorbereitung wiederfinden“ verwenden. Gespeicherte Anfragereferenzen bleiben erhalten.'));throw e;}});
 prepare.onclick=()=>invoke(true);refresh.onclick=()=>invoke(false);
}
