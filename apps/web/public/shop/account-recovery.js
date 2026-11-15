export function mountAccountRecovery({host,fetchImpl}){
 const d=host.ownerDocument,w=d.defaultView,make=(tag,text)=>{const e=d.createElement(tag);if(text)e.textContent=text;return e;};
 const form=make('form'),label=make('label','E-Mail-Adresse deines Bringness-Kontos'),input=make('input'),button=make('button','Link zum Zurücksetzen anfordern'),status=make('p');let active=null,epoch=0,timer=null,disposed=false;
 input.name='email';input.type='email';input.autocomplete='username';input.maxLength=254;input.required=true;input.setAttribute('autocapitalize','none');input.spellcheck=false;label.append(input);form.noValidate=true;button.type='submit';status.setAttribute('role','status');status.setAttribute('aria-live','polite');form.append(label,button);host.replaceChildren(make('p','Du nutzt die bestehende Wiederherstellung für dein gemeinsames Bringness-Konto. Es wird keine neue Anmeldung angelegt.'),form,status);
 const request=fetchImpl||((...args)=>w.fetch(...args));
 function busy(value){form.setAttribute('aria-busy',String(value));input.disabled=button.disabled=value;}
 function clear(){epoch++;active?.abort();active=null;w.clearTimeout(timer);timer=null;input.value='';status.textContent='';busy(false);}
 async function submit(event){event.preventDefault();if(disposed||active||!host.isConnected)return;const email=input.value.trim();if(email.length>254||!email||!input.checkValidity()){status.textContent='Bitte eine gültige E-Mail-Adresse eingeben.';input.focus();return;}
  const current=++epoch,controller=new w.AbortController();active=controller;busy(true);status.textContent='Link wird angefordert …';timer=w.setTimeout(()=>controller.abort(),20000);
  try{const response=await request('/api/v1/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email}),credentials:'omit',mode:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});if(current!==epoch||disposed)return;
   if(!response.ok){status.textContent=response.status===429?'Zu viele Anfragen. Bitte warte und versuche es später erneut.':response.status===400?'Bitte die E-Mail-Adresse prüfen.':'Der Link konnte nicht bestätigt angefordert werden. Bitte später erneut versuchen.';return;}
   const result=await response.json();if(current!==epoch||disposed)return;if(!result||typeof result.message!=='string'||result.message.length>1000)throw Error('Invalid response');
   input.value='';status.textContent='Falls für diese Adresse ein berechtigtes Konto besteht, erhältst du einen Link zum Zurücksetzen. Bitte auch den Spamordner prüfen.';
  }catch{if(current===epoch&&!disposed)status.textContent='Die Anfrage wurde nicht bestätigt. Bitte Verbindung prüfen und ausdrücklich erneut versuchen.';}
  finally{if(current===epoch&&!disposed){active=null;w.clearTimeout(timer);timer=null;busy(false);}}
 }
 const storage=event=>{if(event.key===null||event.key==='bringness-shop-token')clear();};form.addEventListener('submit',submit);w.addEventListener('pagehide',clear);w.addEventListener('storage',storage);
 return {clear,dispose(){clear();disposed=true;form.removeEventListener('submit',submit);w.removeEventListener('pagehide',clear);w.removeEventListener('storage',storage);host.replaceChildren();}};
}
if(typeof document!=='undefined'){const host=document.getElementById('shop-recovery-host');if(host)mountAccountRecovery({host});}
