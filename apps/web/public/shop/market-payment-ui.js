import {marketMoney} from './market-policy.js';
import {marketError} from './market-client.js';
const labels={not_started:'Noch keine Testzahlung gestartet',prepared:'Testzahlung vorbereitet',uncertain:'Zahlungsantwort unklar – bitte abgleichen',open:'Testzahlung offen',pending:'Testzahlung wird geprüft',authorized:'Testzahlung autorisiert',paid:'Testzahlung bestätigt',failed:'Testzahlung fehlgeschlagen',expired:'Testzahlung abgelaufen',canceled:'Testzahlung abgebrochen'};
export function safeMarketCheckoutUrl(value){try{const u=new URL(value);return typeof value==='string'&&u.protocol==='https:'&&['www.mollie.com','checkout.mollie.com'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.hash;}catch{return false;}}
export function mountMarketPayment({window:w,host,client,orderId,amountCents,isCurrent=()=>true,autoLoad=false}){
 const d=host.ownerDocument,el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const panel=el('section'),status=el('p','Testzahlung: Zahlungsstand noch nicht geladen.'),actions=el('div');panel.dataset.paymentOrder=orderId;status.setAttribute('role','status');
 panel.append(status,el('p','Testmodus. Es wird keine echte Zahlung oder Warenfreigabe bestätigt.'),actions);host.append(panel);
 let busy=false,disposed=false,epoch=0,state;
 const current=()=>!disposed&&isCurrent()&&!d.hidden;
 function valid(r){return r?.orderId===orderId&&r.paymentMode==='test'&&r.canPay===false&&r.canFulfil===false&&Object.hasOwn(labels,r.paymentStatus)&&Number.isSafeInteger(r.amountCents)&&r.amountCents>0&&(amountCents===undefined||r.amountCents===amountCents)&&r.currency==='EUR'&&(r.checkoutUrl==null||safeMarketCheckoutUrl(r.checkoutUrl))&&(r.paymentStatus!=='not_started'||r.canStartTest===true);}
 function button(label,fn){const b=el('button',label);b.type='button';b.disabled=busy;b.addEventListener('click',fn);actions.append(b);}
 function render(){actions.replaceChildren();if(state){status.textContent=labels[state.paymentStatus]+' · '+marketMoney(state.amountCents)+' inkl. MwSt.';
  if(state.paymentStatus==='not_started'&&state.canStartTest)button('Testzahlung starten',()=>run('start'));
  if(['open','pending','authorized'].includes(state.paymentStatus)&&state.checkoutUrl){const a=el('a','Testzahlung bei Mollie fortsetzen');a.href=state.checkoutUrl;a.rel='noreferrer noopener';a.referrerPolicy='no-referrer';actions.append(a);}
  if(state.paymentStatus!=='not_started')button('Zahlungsstand abgleichen',()=>run('refresh'));
 }else button('Test-Zahlungsstand laden',()=>run('load'));}
 async function run(kind){if(busy||!current())return;
  if(kind==='start'&&!w.confirm('Testzahlung für diese Bestellung starten? Dies ist keine echte Bezahlung und gibt keine Ware frei.'))return;
  busy=true;const start=++epoch;render();
  try{const r=await client.call(kind==='load'?'/checkout-availability?'+new URLSearchParams({orderId}):kind==='start'?'/checkout':'/checkout-refresh',{auth:true,...(kind==='load'?{}:{body:{orderId,...(kind==='start'?{requestId:w.crypto.randomUUID()}:{})}})});
   if(start!==epoch||!current())return;if(!valid(r))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});state=r;render();
  }catch(e){if(start===epoch&&current()){
   // After a lost POST reply, only status/GET-based recovery remains available.
   if(kind==='start')state={orderId,paymentMode:'test',paymentStatus:'uncertain',amountCents:state?.amountCents||amountCents,currency:'EUR',canPay:false,canFulfil:false};
   render();status.textContent=marketError(e);
  }}finally{busy=false;if(start===epoch&&current()){for(const b of actions.querySelectorAll('button'))b.disabled=false;}}
 }
 render();if(autoLoad)run('load');return {load:()=>run('load'),dispose(){disposed=true;epoch++;panel.replaceChildren();}};
}
