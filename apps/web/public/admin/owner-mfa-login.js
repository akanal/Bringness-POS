// Challenges and codes stay in this dialog's memory, never browser storage.
export async function completeOwnerLogin(data,{fetcher=fetch,signal}={}){
 if(!data?.mfaRequired)return data;
 if(!/^[a-f0-9]{64}$/.test(data.challenge||''))throw Error('Bitte erneut anmelden.');
 const dialog=document.createElement('dialog');dialog.className='owner-mfa-dialog';
 dialog.innerHTML='<form><h2>Zwei-Faktor-Anmeldung</h2><p>Gib den aktuellen sechsstelligen Code deiner Authenticator-App ein.</p><label>Code<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="80" required autofocus></label><label><input name="recovery" type="checkbox"> Wiederherstellungscode verwenden</label><p role="status" aria-live="polite"></p><div><button type="submit">Anmeldung bestätigen</button><button type="button" data-cancel>Abbrechen</button></div></form>';
 if(!document.querySelector('link[data-owner-mfa-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/admin/owner-mfa-login.css?v=20261107';link.dataset.ownerMfaStyle='true';document.head.append(link)}document.body.append(dialog);
 const form=dialog.querySelector('form'),input=form.elements.code,checkbox=form.elements.recovery,message=form.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');
 checkbox.onchange=()=>{input.value='';input.inputMode=checkbox.checked?'text':'numeric';input.focus()};
 return new Promise((resolve,reject)=>{
  let done=false,submitting=false;const controller=new AbortController();let timer;
  const finish=(result,error)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);window.removeEventListener('pagehide',abort);window.removeEventListener('storage',changed);clearTimeout(timer);controller.abort();form.reset();dialog.close();dialog.remove();error?reject(error):resolve({...data,...result,mfaRequired:false,challenge:undefined})};
  const abort=()=>finish(null,Object.assign(Error('Zwei-Faktor-Anmeldung abgebrochen.'),{code:'MFA_CANCELLED'}));
  const changed=event=>{if(event.key===null||['bringness-shop-token','bringness-pos-token','bringness-pos-admin-token','bringness-market-admin-token','bringness-ai-admin-session'].includes(event.key))finish(null,Object.assign(Error('Konto gewechselt. Bitte erneut anmelden.'),{code:'ACCOUNT_CHANGED'}))};
  window.addEventListener('pagehide',abort,{once:true});window.addEventListener('storage',changed);timer=setTimeout(abort,300000);
  if(signal?.aborted){abort();return}signal?.addEventListener('abort',abort,{once:true});
  dialog.addEventListener('cancel',event=>{event.preventDefault();abort()});dialog.querySelector('[data-cancel]').onclick=abort;
  form.onsubmit=async event=>{event.preventDefault();if(submitting)return;submitting=true;submit.disabled=true;message.textContent='Code wird geprüft …';try{
   const response=await fetcher('/api/v1/platform/security/verify-login',{method:'POST',credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:data.challenge,code:input.value.replace(/\s/gu,'')}),signal:controller.signal});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Die Anmeldung ist derzeit nicht möglich.');
   if(!/^[a-f0-9]{64}$/.test(result.token||''))throw Error('Bitte erneut anmelden.');finish(result);
  }catch(error){if(!done){message.textContent=error.message;input.value='';input.focus()}}finally{submitting=false;submit.disabled=false}};
  dialog.showModal();input.focus();
 });
}
