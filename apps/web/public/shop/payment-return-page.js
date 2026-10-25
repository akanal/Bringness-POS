import {readPaymentReturnLocation,paymentReturnHref} from './payment-return-state.js';
import {readPaymentReturnOrder} from './payment-return-client.js';
import {mountPaymentReturn} from './payment-return-ui.js';
import {setShopStatus} from './status-view.js';
const host=document.getElementById('payment-return-host'),token=()=>{try{return localStorage.getItem('bringness-pos-token')||'';}catch{return '';}};let mounted;
function start(){mounted?.dispose();const id=window.top===window.self?readPaymentReturnLocation(window.location.href):null;
 try{window.history.replaceState(null,'',id?paymentReturnHref(id):'/shop/payment-return.html');}catch{/* No token is ever accepted from the URL; server authentication remains required. */}
 if(!id){const p=document.createElement('p');setShopStatus(p,'warning','Keine eindeutige Vorgangsnummer. Bitte über den gespeicherten Vorgang oder deinen Kontobereich fortfahren. Rückkehrangaben gelten nicht als Zahlungsnachweis.');host.replaceChildren(p);return;}
 mounted=mountPaymentReturn({host,id,getToken:token,request:readPaymentReturnOrder});
}
window.addEventListener('hashchange',start);window.addEventListener('pagehide',()=>mounted?.dispose());window.addEventListener('pageshow',e=>{if(e.persisted)start();});start();
