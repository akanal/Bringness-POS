import {paintPasswordEye,placePasswordEye} from './password-eye.js';
import {requestShopLogin,validShopLogin,shopLoginDestination} from './account-login-client.js';
const key='bringness-pos-token';
const messages={INVALID_INPUT:'Bitte E-Mail und Passwort vollständig eingeben.',INVALID_CREDENTIALS:'E-Mail oder Passwort stimmen nicht. Bitte die Angaben prüfen.',LOGIN_LIMIT:'Zu viele gleichzeitige Anmeldeversuche. Bitte später ausdrücklich erneut versuchen.',SHOP_ACCOUNT_REQUIRED:'Für den Shop wird ein Inhaber- oder Administratorkonto benötigt.',LOGIN_UNAVAILABLE:'Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.',STORAGE_UNAVAILABLE:'Die Anmeldung konnte im Browser nicht gespeichert werden. Bitte die Browsereinstellungen prüfen.',ACCOUNT_CHANGED:'Das Konto hat sich geändert. Bitte erneut anmelden.'};
export function mountShopLogin({host,storage,request=requestShopLogin,hash='',timeoutMs=15000}){
 const d=host.ownerDocument,w=d.defaultView;let generation=0,active=null,timer=null,disposed=false,loggedToken=null;
 const el=(tag,text)=>{const e=d.createElement(tag);if(text)e.textContent=text;return e;};
 const form=el('form'),email=el('input'),password=el('input'),toggle=el('button','Passwort anzeigen'),submit=el('button','Anmelden'),note=el('p'),next=el('a','Weiter zur Bestellprüfung');
 const field=(label,input)=>{const e=el('label',label);e.append(input);form.append(e);};
 email.type='email';email.name='email';email.autocomplete='username';email.maxLength=254;email.required=true;email.setAttribute('autocapitalize','none');email.spellcheck=false;
 password.type='password';password.name='password';password.autocomplete='current-password';password.maxLength=128;password.required=true;field('E-Mail',email);field('Passwort',password);
 toggle.type='button';toggle.setAttribute('aria-pressed','false');submit.type='submit';note.setAttribute('role','status');next.href=shopLoginDestination(hash);next.referrerPolicy='no-referrer';next.hidden=true;if(hash!=='#review')next.textContent=hash==='#merchant'?'Weiter zum Händlerbereich':hash==='#marketplace'?'Weiter zu Händlerangeboten und Bestellungen':hash==='#licences'?'Weiter zu meinen Lizenzen':'Weiter zum Shop';placePasswordEye(password,toggle);submit.className='action-primary';form.append(submit);host.replaceChildren(form,note,next);
 function clear(){password.value='';password.type='password';paintPasswordEye(toggle,false);}
 function stop(message=''){generation++;active?.abort();active=null;w.clearTimeout(timer);timer=null;submit.disabled=false;email.disabled=false;toggle.disabled=false;clear();next.hidden=true;loggedToken=null;note.textContent=message;}
 function available(){return !disposed&&host.isConnected&&d.visibilityState!=='hidden'&&w.navigator.onLine!==false;}
 function readToken(){return storage.getItem(key)||'';}
 toggle.onclick=()=>{if(!available()||active)return;const reveal=password.type==='password';password.type=reveal?'text':'password';paintPasswordEye(toggle,reveal);};
 const send=async event=>{
  event.preventDefault();if(!available()||active)return;
  if(!validShopLogin(email.value,password.value)){note.textContent=messages.INVALID_INPUT;clear();return;}
  let original;try{original=readToken();}catch{note.textContent=messages.STORAGE_UNAVAILABLE;clear();return;}
  const credentials={email:email.value,password:password.value},epoch=++generation,controller=new AbortController();active=controller;submit.disabled=true;email.disabled=true;toggle.disabled=true;next.hidden=true;clear();note.textContent='Anmeldung wird geprüft …';
  timer=w.setTimeout(()=>stop('Die Anmeldung hat zu lange gedauert. Bitte ausdrücklich erneut versuchen.'),timeoutMs);
  try{
   const pending=request({...credentials,signal:controller.signal});credentials.password='';const result=await pending;if(epoch!==generation||!available())return;
   if(readToken()!==original)throw Object.assign(Error(),{code:'ACCOUNT_CHANGED'});
   try{storage.setItem(key,result.token);if(readToken()!==result.token)throw Error();}catch{throw Object.assign(Error(),{code:'STORAGE_UNAVAILABLE'});}
   loggedToken=result.token;next.hidden=false;note.textContent='Angemeldet. Du kannst im Shop fortfahren. Konto und Preise werden dort erneut geprüft.';
  }catch(e){if(epoch===generation&&available())note.textContent=messages[e.code]||messages.LOGIN_UNAVAILABLE;}
  finally{credentials.password='';if(epoch===generation){w.clearTimeout(timer);active=null;submit.disabled=false;email.disabled=false;toggle.disabled=false;clear();}}
 };
 form.addEventListener('submit',send);
 const privacy=()=>{if(d.visibilityState==='hidden')stop();},offline=()=>stop('Offline. Für die Anmeldung wird eine Verbindung benötigt.'),change=e=>{if(e.key===key||e.key===null)stop(messages.ACCOUNT_CHANGED);},focus=()=>{if(loggedToken){try{if(readToken()!==loggedToken)stop(messages.ACCOUNT_CHANGED);}catch{stop(messages.STORAGE_UNAVAILABLE);}}};
 next.onclick=e=>{try{if(!available()||!loggedToken||readToken()!==loggedToken){e.preventDefault();stop(messages.ACCOUNT_CHANGED);}}catch{e.preventDefault();stop(messages.STORAGE_UNAVAILABLE);}};
 d.addEventListener('visibilitychange',privacy);w.addEventListener('offline',offline);w.addEventListener('storage',change);w.addEventListener('focus',focus);
 return {dispose(){if(disposed)return;disposed=true;stop();form.removeEventListener('submit',send);d.removeEventListener('visibilitychange',privacy);w.removeEventListener('offline',offline);w.removeEventListener('storage',change);w.removeEventListener('focus',focus);host.replaceChildren();}};
}
