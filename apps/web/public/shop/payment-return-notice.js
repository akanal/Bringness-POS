import {legacyPaymentReturn,paymentReturnHref} from './payment-return-state.js';
import {setShopStatus} from './status-view.js';
export function mountLegacyPaymentReturnNotice({host,href}){
 if(!host)return;const hint=legacyPaymentReturn(href);if(!hint)return;const d=host.ownerDocument,p=d.createElement('p');host.className='payment-return-notice';host.hidden=false;
 setShopStatus(p,'warning',hint.invalid?'Die Rückkehrdaten sind nicht eindeutig. Bitte den gespeicherten Vorgang über dein Konto oder den Kaufverlauf prüfen.':'Du bist vom Zahlungsanbieter zurückgekehrt. Das bestätigt noch keine Zahlung. Prüfe jetzt den gespeicherten Vorgang.');host.replaceChildren(p);
 if(hint.id){const link=d.createElement('a');link.className='button outline';link.textContent='Gespeicherten Rückkehrstatus prüfen';link.href=paymentReturnHref(hint.id);link.referrerPolicy='no-referrer';host.append(link);}
 const history=d.createElement('a');history.className='button outline';history.textContent='Windows-Kaufverlauf öffnen';history.href='/shop/download-history.html';const account=d.createElement('a');account.textContent='Bestehendes Konto öffnen';account.href='/pos/';const close=d.createElement('button');close.className='outline';close.textContent='Hinweis schließen';close.type='button';close.onclick=()=>{host.replaceChildren();host.hidden=true;d.getElementById('search')?.focus();};host.append(history,account,close);return true;
}
