import {checkoutUuid} from './checkout-state.js';
// Public record identity only; no token, provider URL, or private capability.
export function appendHistoryReference({document,window,host,id,allowed}){
 if(!checkoutUuid(id))throw Error('INVALID_REQUEST');
 const input=document.createElement('input'),label=document.createElement('label'),copy=document.createElement('button'),status=document.createElement('p');
 input.value=id;input.readOnly=true;input.className='record-reference';input.setAttribute('aria-label','Vorgangsnummer');label.textContent='Vorgangsnummer';label.append(input);copy.type='button';copy.className='outline';copy.textContent='Vorgangsnummer kopieren';status.className='muted';status.setAttribute('role','status');
 copy.onclick=async()=>{
  if(!input.isConnected||!allowed())return;
  input.focus();input.select();
  try{if(!window.navigator.clipboard?.writeText)throw Error();await window.navigator.clipboard.writeText(id);if(input.isConnected&&allowed())status.textContent='Vorgangsnummer kopiert.';}
  catch{if(input.isConnected&&allowed())status.textContent='Vorgangsnummer markiert. Bitte mit der Kopierfunktion deines Geräts kopieren.';}
 };
 host.append(label,copy,status);
 return {input,copy,status};
}
