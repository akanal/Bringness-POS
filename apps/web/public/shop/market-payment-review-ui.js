import {marketError} from './market-client.js';
export function mountMarketPaymentReview({window:w,host,client}){
 const d=host.ownerDocument,el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const section=el('section'),heading=el('h3','Testzahlungen prüfen'),load=el('button','Zahlungsübersicht laden'),status=el('p'),list=el('div');
 load.type='button';status.setAttribute('role','status');section.append(heading,load,status,list);host.append(section);
 const labels={prepared:'Noch nicht gestartet',uncertain:'Antwort unklar',open:'Offen',pending:'In Bearbeitung',authorized:'Autorisiert',paid:'Testzahlung bestätigt',failed:'Fehlgeschlagen',expired:'Abgelaufen',canceled:'Abgebrochen'};
 let epoch=0,busy=false;const token=()=>w.localStorage.getItem('bringness-pos-token');
 function privacy(){epoch++;list.replaceChildren();status.textContent='Private Zahlungsübersicht geschlossen. Bitte erneut laden.';}
 w.addEventListener('pagehide',privacy);w.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')privacy();});d.addEventListener('visibilitychange',()=>{if(d.hidden)privacy();});
 function render(r){
  if(r.paymentMode!=='test'||r.canPay!==false||r.canFulfil!==false||!Array.isArray(r.payments)||r.payments.length>50||typeof r.hasMore!=='boolean')throw Error('INVALID_RESPONSE');
  const fragment=d.createDocumentFragment();
  for(const p of r.payments){
   if(!/^[a-f0-9-]{36}$/i.test(p.orderId)||!Object.hasOwn(labels,p.paymentStatus)||!Number.isSafeInteger(p.amountCents)||p.amountCents<1||p.currency!=='EUR'||typeof p.reviewRequired!=='boolean'||typeof p.overdue!=='boolean'||typeof p.canRecheck!=='boolean')throw Error('INVALID_RESPONSE');
   const row=el('article');row.append(el('p',p.orderId+' · '+labels[p.paymentStatus]+' · '+(p.amountCents/100).toFixed(2)+' EUR'));
   if(p.reviewRequired||p.overdue)row.append(el('p',p.reviewRequired?'Manuelle Prüfung erforderlich.':'Seit mehr als 24 Stunden ungeklärt.'));
   if(p.lastCheckedAt)row.append(el('p','Zuletzt geprüft: '+new Date(p.lastCheckedAt).toLocaleString('de-DE')));
   if(p.canRecheck){const button=el('button','Zahlungsstand nachprüfen');button.type='button';button.addEventListener('click',()=>action(p.orderId));row.append(button);}
   fragment.append(row);
  }
  list.replaceChildren(fragment);status.textContent=r.payments.length?(r.hasMore?'Die neuesten 50 Testzahlungen. Weitere Vorgänge sind vorhanden.':'Testzahlungen geladen. Keine Warenfreigabe oder Umsatzbuchung.'):'Keine Testzahlungen vorhanden.';
 }
 async function action(orderId){
  if(busy||d.hidden)return;busy=true;const start=++epoch,original=token();for(const b of section.querySelectorAll('button'))b.disabled=true;list.replaceChildren();status.textContent='Zahlungsstand wird geprüft.';
  try{const r=await client.call(orderId?'/merchant-recheck':'/merchant-payments',{auth:true,...(orderId?{body:{orderId}}:{})});if(start!==epoch||token()!==original||d.hidden)return;render(r);if(orderId&&r.confirmed===false)status.textContent='Zahlungsstand nicht bestätigt. Die Bestellung bleibt gesperrt; später erneut prüfen.';}
  catch(e){if(start===epoch){if(token()!==original)privacy();else{list.replaceChildren();status.textContent=marketError(e);}}}
  finally{busy=false;for(const b of section.querySelectorAll('button'))b.disabled=false;}
 }
 load.addEventListener('click',()=>action());return {privacy};
}
