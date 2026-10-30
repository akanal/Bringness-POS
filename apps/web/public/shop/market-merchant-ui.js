import {mountMarketReadiness} from './market-readiness-ui.js';
import {marketError} from './market-client.js';
export function mountMarketMerchant({window:w,host,client}){
 const readiness=mountMarketReadiness({window:w,host,client});
 const d=host.ownerDocument,el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const status=el('p','Händler-Zahlungsverbindung noch nicht geladen.'),load=el('button','Verbindungsstatus laden'),connect=el('button','Mollie-Konto für Test verbinden'),disconnect=el('button','Verbindung für Bringness sperren'),form=el('form'),label=el('label','Mollie-Profil-ID'),profile=el('input'),verify=el('button','Händlerprofil prüfen');
 const labels={not_connected:'Nicht verbunden',pending:'Verbunden – Profilprüfung fehlt',verified:'Händlerprofil für Testzahlungen geprüft',revoked:'Verbindung für Bringness gesperrt',reconnect_required:'Erneute Händlerfreigabe erforderlich'};
 status.setAttribute('role','status');for(const b of [load,connect,disconnect])b.type='button';verify.type='submit';profile.name='profileId';profile.required=true;profile.pattern='pfl_[A-Za-z0-9]{1,100}';profile.maxLength=104;label.append(profile);form.append(label,verify);
 connect.hidden=true;disconnect.hidden=true;form.hidden=true;host.append(status,load,connect,form,disconnect,el('p','Nur Testmodus. Die Sperre entfernt den lokalen Zugang; eine Freigabe bei Mollie kann zusätzlich im Mollie-Konto widerrufen werden.'));
 let busy=false,epoch=0;const token=()=>w.localStorage.getItem('bringness-pos-token');
 function privacy(){readiness.privacy();epoch++;status.textContent='Private Zahlungsansicht geschlossen. Bitte erneut laden.';profile.value='';connect.hidden=true;disconnect.hidden=true;form.hidden=true;}
 w.addEventListener('pagehide',privacy);w.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')privacy();});d.addEventListener('visibilitychange',()=>{if(d.hidden)privacy();});
 async function action(kind,body){if(busy||d.hidden)return;busy=true;const start=++epoch,original=token();for(const b of [load,connect,disconnect,verify])b.disabled=true;
  try{const r=await client.call('/merchant-'+kind,{auth:true,...(body?{body}:{})});if(start!==epoch||token()!==original||d.hidden)return;
   if(kind==='connect'){
    const u=new URL(r.authorizationUrl);if(u.origin!=='https://my.mollie.com'||u.pathname!=='/oauth2/authorize'||u.username||u.password||r.paymentsEnabled!==false)throw Error('INVALID_RESPONSE');w.location.assign(u.href);return;
   }
   if(!Object.hasOwn(labels,r.status)||r.paymentMode!=='test'||r.paymentsEnabled!==false)throw Error('INVALID_RESPONSE');
   status.textContent=labels[r.status]+(r.profileId?' · '+r.profileId:'');connect.hidden=!r.configured&&kind==='status'||['pending','verified'].includes(r.status);disconnect.hidden=!['pending','verified','reconnect_required'].includes(r.status);form.hidden=!['pending','verified'].includes(r.status);if(r.profileId)profile.value=r.profileId;
  }catch(e){if(start===epoch&&token()===original){status.textContent=marketError(e);connect.hidden=true;disconnect.hidden=true;profile.value='';form.hidden=true;}}
  finally{busy=false;for(const b of [load,connect,disconnect,verify])b.disabled=false;}
 }
 load.addEventListener('click',()=>action('status'));connect.addEventListener('click',()=>action('connect',{}));disconnect.addEventListener('click',()=>{if(w.confirm('Diesen Händlerzugang für Bringness sperren? Bestehende Bestellungen und Zahlungsdaten bleiben erhalten.'))action('disconnect',{});});form.addEventListener('submit',e=>{e.preventDefault();if(form.reportValidity())action('verify',{profileId:profile.value});});
 const u=new URL(w.location.href);if(u.searchParams.has('merchantConnection')){status.textContent='Rückkehr von Mollie. Bitte den gespeicherten Verbindungsstatus laden.';u.searchParams.delete('merchantConnection');w.history.replaceState(null,'',u.pathname+u.search+u.hash);}
 return {privacy};
}

