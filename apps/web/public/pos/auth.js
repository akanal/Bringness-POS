// The sign-in and recovery controls must work even if a register extension fails.
(()=>{
 'use strict';
 const el=id=>document.getElementById(id),form=el('authForm');
 if(!form||window.bnPosAuth)return;
 let mode='login',busy=false,acceptSession=null;
 const message=text=>{el('authMsg').textContent=text;};
 function setBusy(value){
  busy=value;form.setAttribute('aria-busy',String(value));
  for(const id of ['authSubmit','loginTab','registerTab','forgotPassword'])el(id).disabled=value;
  el('authSubmit').textContent=value?'Wird geladen…':mode==='register'?'Konto erstellen':'Anmelden';
 }
 function setMode(value){
  if(busy)return;mode=value==='register'?'register':'login';const isNew=mode==='register',password=el('password');
  el('authTitle').textContent=isNew?'Dein Einstieg.':'Willkommen zurück.';
  el('name').required=isNew;el('nameField').style.display=isNew?'grid':'none';
  el('loginTab').classList.toggle('active',!isNew);el('registerTab').classList.toggle('active',isNew);
  password.autocomplete=isNew?'new-password':'current-password';
  if(isNew){password.minLength=6;password.pattern='(?=.*\\p{Lu})(?=.*\\p{Ll})(?=.*\\p{Nd})(?=.*[^\\p{L}\\p{N}\\s]).{6,128}';password.title='Mindestens 6 Zeichen, ein Großbuchstabe, ein Kleinbuchstabe, eine Zahl und ein Sonderzeichen (maximal 128 Zeichen).';}
  else{password.removeAttribute('minlength');password.removeAttribute('pattern');password.removeAttribute('title');}
  el('passwordRules').hidden=!isNew;message('');setBusy(false);
 }
 async function request(path,body){
  const controller=typeof AbortController==='function'?new AbortController():null;
  let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('Die Verbindung dauert zu lange. Bitte erneut versuchen.'));controller?.abort();},path==='forgot-password'?60000:20000);});
  try{
   return await Promise.race([deadline,(async()=>{
    const response=await fetch('/api/v1/auth/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body),...(controller?{signal:controller.signal}:{})});
    let result;try{result=await response.json();}catch{throw Error('Die Serverantwort ist unvollständig. Bitte erneut versuchen.');}
    if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Die Serverantwort ist unvollständig. Bitte erneut versuchen.');
    if(!response.ok)throw Error(typeof result.error==='string'&&result.error.trim()?result.error:'Anfrage fehlgeschlagen. Bitte erneut versuchen.');
    return result;
   })()]);
  }catch(error){throw Error(error?.message==='Failed to fetch'||error?.name==='TypeError'?'Verbindung zum Server fehlgeschlagen. Bitte erneut versuchen.':error?.message||'Verbindung zum Server fehlgeschlagen. Bitte erneut versuchen.');}
  finally{clearTimeout(timer);}
 }
 el('loginTab').onclick=()=>setMode('login');el('registerTab').onclick=()=>setMode('register');
 el('togglePassword').onclick=()=>{const p=el('password'),show=p.type==='password';p.type=show?'text':'password';el('togglePassword').textContent=show?'🙈':'👁️';el('togglePassword').setAttribute('aria-label',show?'Passwort verbergen':'Passwort anzeigen');};
 el('forgotPassword').onclick=async()=>{
  if(busy)return;const email=el('email').value.trim();
  if(!email||!el('email').checkValidity()){message('Bitte zuerst eine gültige E-Mail-Adresse eingeben.');return;}
  setBusy(true);message('Reset-Link wird angefordert. Bitte kurz warten und nicht erneut klicken.');
  try{const result=await request('forgot-password',{email});if(typeof result.message!=='string'||!result.message.trim())throw Error('Die Serverbestätigung fehlt. Bitte erneut versuchen.');message(result.message);}
  catch(error){message(error.message);}finally{setBusy(false);}
 };
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  setBusy(true);message('Verbindung wird hergestellt…');
  try{
   const result=await request(mode,{name:el('name').value,email:el('email').value.trim(),password:el('password').value});
   if(typeof result.token!=='string'||!result.token.trim())throw Error('Die Anmeldebestätigung fehlt. Bitte erneut versuchen.');
   const waiter=result.user?.role==='waiter';let stored=false;
   try{localStorage.setItem(waiter?'bringness-waiter-token':'bringness-pos-token',result.token);stored=true;}catch{/* The active register can keep this session in memory. */}
   if(waiter){if(!stored)throw Error('Der Browser blockiert den Sitzungsspeicher. Bitte Speicherung für Bringness erlauben.');location.replace('/service/');return;}
   if(acceptSession){await acceptSession(result);}
   else{
    if(!stored)throw Error('Das Kassenprogramm konnte nicht geladen werden und der Browser blockiert den Sitzungsspeicher. [POS-START]');
    message('Anmeldung erfolgreich. Die Kasse wird neu geladen…');location.reload();
   }
  }catch(error){message(error.message||'Anmeldung fehlgeschlagen. Bitte erneut versuchen.');}finally{setBusy(false);}
 };
 window.bnPosAuth={setMode,connect(handler){acceptSession=handler;},reportStartup(){if(!acceptSession&&!busy&&!el('authMsg').textContent)message('Das Kassenprogramm konnte nicht vollständig geladen werden. Anmeldung und Passwort-Wiederherstellung bleiben verfügbar. Bitte Seite neu laden. [POS-START]');}};
 setBusy(false);message('');
 // A failed main script must no longer leave two apparently working, silent buttons.
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>window.bnPosAuth.reportStartup(),{once:true});
 else setTimeout(()=>window.bnPosAuth.reportStartup(),0);
})();
