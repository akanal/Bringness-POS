import {mountMarketPayment} from './market-payment-ui.js';
import {marketMoney} from './market-policy.js';
import {marketError} from './market-client.js';
import {marketOrderLabels,marketOrderActions} from './market-order-policy.js';
import {marketTracking,marketCarriers,marketTrackingUrl} from './market-tracking-policy.js';
const labels={accept:'Bestellung annehmen',reject:'Bestellung ablehnen',cancel:'Bestellung stornieren',ready:'Als abholbereit markieren',ship:'Als versendet markieren'};
export function mountMarketOrderViews({window:w,document:d=w.document,client,seller}){
 const prefix=seller?'seller':'buyer',host=d.getElementById(prefix+'-orders'),status=d.getElementById(prefix+'-orders-status'),load=d.getElementById(prefix+'-orders-load');
 if(!host||!load||!status)return;
 let epoch=0,busy=false,rows=[],lastToken=w.localStorage.getItem('bringness-pos-token');const drafts=new Map();
 const el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('market-error',error);};
 function privacy(){epoch++;rows=[];drafts.clear();host.replaceChildren();message('Private Bestellansicht geschlossen. Bitte erneut laden.');lastToken=w.localStorage.getItem('bringness-pos-token');}
 w.addEventListener('pagehide',privacy);w.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')privacy();});d.addEventListener('visibilitychange',()=>{if(d.hidden)privacy();});w.addEventListener('focus',()=>{if(lastToken!==w.localStorage.getItem('bringness-pos-token'))privacy();});
 function valid(r){try{if(r?.tracking)marketTracking(r.tracking);}catch{return false;}return r&&typeof r.id==='string'&&typeof r.reference==='string'&&Object.hasOwn(marketOrderLabels,r.status)&&Number.isSafeInteger(r.revision)&&r.revision>=0&&r.paymentStatus==='unpaid'&&r.canPay===false&&Array.isArray(r.lines)&&Number.isSafeInteger(r.grossCents)&&['shipping','pickup'].includes(r.method)&&(!r.tracking||Number.isSafeInteger(r.trackingRevision)&&r.trackingRevision>0);}
 function trackingForm(r,box){
  const form=el('form'),carrier=el('select'),name=el('input'),number=el('input');form.dataset.trackingForm=r.id;
  const draft=drafts.get(r.id)||r.tracking||{carrier:'dhl',carrierName:'DHL',number:''};
  for(const [value,label]of Object.entries(marketCarriers)){const option=el('option',label);option.value=value;carrier.append(option);}carrier.value=draft.carrier;carrier.name='carrier';name.name='carrierName';number.name='number';name.value=draft.carrierName;number.value=draft.number;
  name.maxLength=80;name.required=true;number.maxLength=80;number.required=true;number.pattern='[A-Za-z0-9][A-Za-z0-9\\-]{2,79}';number.autocomplete='off';
  for(const [label,input]of [['Versanddienst',carrier],['Name des Versanddienstes',name],['Sendungsnummer',number]]){const field=el('label',label);field.append(input);form.append(field);}
  const save=el('button',r.tracking?'Versanddaten korrigieren':'Versanddaten speichern');save.type='submit';save.disabled=busy;carrier.disabled=busy;number.disabled=busy;name.disabled=busy||carrier.value==='dhl';
  const retain=()=>drafts.set(r.id,{carrier:carrier.value,carrierName:carrier.value==='dhl'?'DHL':name.value,number:number.value});
  carrier.addEventListener('change',()=>{if(carrier.value==='dhl')name.value='DHL';else if(name.value==='DHL')name.value='';name.disabled=carrier.value==='dhl';retain();});name.addEventListener('input',retain);number.addEventListener('input',retain);
  form.append(el('p','Vom Händler angegebene Versanddaten. Kein Versandlabel, keine Anbieterabfrage und kein Zustellnachweis.'),save);
  form.addEventListener('submit',event=>{event.preventDefault();if(busy||!form.reportValidity())return;let tracking;try{tracking=marketTracking({carrier:carrier.value,carrierName:carrier.value==='dhl'?'DHL':name.value,number:number.value});}catch{message('Versanddienst und Sendungsnummer bitte vollständig prüfen.',true);return;}if(!w.confirm('Versanddaten zu '+r.reference+' speichern? Es wird kein Versand ausgelöst.'))return;commit('order-tracking',{requestId:w.crypto.randomUUID(),orderId:r.id,expectedRevision:r.trackingRevision||0,tracking},'Versanddaten bestätigt. Aktuellen Bestellstand laden.');});box.append(form);
 }
 function render(){
  host.replaceChildren();
  for(const r of rows){
   const box=el('article');box.dataset.orderId=r.id;box.append(el('h3',r.reference),el('p',marketOrderLabels[r.status]+' · Stand '+r.revision+' · '+(r.method==='pickup'?'Abholung':'Versand')));
   if(seller){box.append(el('p',r.recipient.name+' · '+r.recipient.street+' · '+r.recipient.postalCode+' '+r.recipient.city+' · '+r.recipient.country),el('p',r.recipient.email));}
   else{box.append(el('p',r.seller.name));if(typeof r.sellerId==='string'&&/^[a-f0-9-]{36}$/i.test(r.sellerId)){const a=el('a','Aktuelles Händlerprofil');a.href='/shop/marketplace.html?'+new URLSearchParams({seller:r.sellerId});box.append(a);}}
   for(const l of r.lines)box.append(el('p',l.quantity+' × '+l.name));box.append(el('p',marketMoney(r.grossCents)+' inkl. MwSt. · Unbezahlt'),el('p',r.delivery),el('p','Zuletzt gespeichert: '+new Date(r.updatedAt).toLocaleString('de-DE')));
   if(r.tracking){box.append(el('p','Versandangabe des Händlers: '+r.tracking.carrierName+' · '+r.tracking.number+' · Stand '+r.trackingRevision));const url=marketTrackingUrl(r.tracking);if(url){const a=el('a','Sendung bei DHL verfolgen (externe Seite)');a.href=url;a.target='_blank';a.rel='noopener noreferrer nofollow';a.referrerPolicy='no-referrer';box.append(a);}box.append(el('p','Versandangabe bestätigt weder Zahlung noch Zustellung.'));}
   if(r.testPayment?.mode==='test')box.append(el('p','Testzahlung: '+r.testPayment.status+' · Keine Warenfreigabe.'));
   if(seller){for(const action of (Array.isArray(r.actions)?r.actions:marketOrderActions(r.status,r.method))){const button=el('button',labels[action]);button.type='button';button.disabled=busy;button.addEventListener('click',()=>write(r,action));box.append(button);}if(r.method==='shipping'&&r.status==='shipped')trackingForm(r,box);}
   host.append(box);if(!seller&&(['received','accepted'].includes(r.status)||r.testPayment?.mode==='test')){const version=epoch;mountMarketPayment({window:w,host:box,client,orderId:r.id,amountCents:r.grossCents,isCurrent:()=>version===epoch});}
  }
  if(!rows.length)host.append(el('p','Keine Bestellungen vorhanden.'));load.disabled=busy;
 }
 async function refresh(){
  if(busy)return;if(drafts.size&&!w.confirm('Ungespeicherte Versandangaben verwerfen und Bestellstand neu laden?'))return;busy=true;const start=++epoch;load.disabled=true;
  try{const result=await client.call(seller?'/inbox':'/buyer-orders',{auth:true});if(start!==epoch)return;if(!Array.isArray(result.orders)||result.orders.length>50||!result.orders.every(valid))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});rows=result.orders;drafts.clear();lastToken=w.localStorage.getItem('bringness-pos-token');message('Gespeicherter Bearbeitungsstand geladen. Unbezahlt; keine Zahlungsbestätigung.');render();}
  catch(e){if(start===epoch){if(['UNAUTHORIZED','FORBIDDEN','SELLER_NOT_APPROVED','ACCOUNT_CHANGED'].includes(e.code)){rows=[];drafts.clear();host.replaceChildren();}message((rows.length?'Älterer Stand – Aktualisierung nicht bestätigt. ':'')+marketError(e),true);}}
  finally{busy=false;load.disabled=false;if(start===epoch)render();}
 }
 async function commit(kind,command,success){
  if(busy||d.hidden)return;busy=true;const start=++epoch;render();
  try{await client.write(kind,command);if(start!==epoch)return;rows=[];drafts.clear();host.replaceChildren();message(success);}
  catch(e){if(start===epoch){if(['UNAUTHORIZED','FORBIDDEN','SELLER_NOT_APPROVED','ACCOUNT_CHANGED'].includes(e.code)){rows=[];drafts.clear();host.replaceChildren();}message('Änderung nicht bestätigt. '+marketError(e),true);}}
  finally{busy=false;load.disabled=false;if(start===epoch&&rows.length)render();}
 }
 function write(row,action){if(busy||d.hidden)return;if(!w.confirm(labels[action]+'?'+(['cancel','reject'].includes(action)?' Die bestellten Mengen werden genau einmal freigegeben.':'')))return;return commit('order-status',{requestId:w.crypto.randomUUID(),orderId:row.id,expectedRevision:row.revision,action},'Statuswechsel bestätigt. Aktuellen Bestellstand laden.');}
 load.addEventListener('click',refresh);
 for(const [id,kind]of [['seller-order-retry','order-status'],['seller-tracking-retry','order-tracking']])d.getElementById(id)?.addEventListener('click',async()=>{if(busy||d.hidden)return;busy=true;const start=++epoch;render();try{await client.retry(kind);if(start!==epoch)return;rows=[];drafts.clear();host.replaceChildren();message('Frühere Anfrage bestätigt. Aktuellen Bestellstand laden.');}catch(e){if(start===epoch){if(['UNAUTHORIZED','FORBIDDEN','SELLER_NOT_APPROVED','ACCOUNT_CHANGED'].includes(e.code)){rows=[];drafts.clear();host.replaceChildren();}message(marketError(e),true);}}finally{busy=false;load.disabled=false;if(start===epoch&&rows.length)render();}});
 return {refresh,privacy};
}
