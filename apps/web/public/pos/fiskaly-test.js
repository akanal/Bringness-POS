(()=>{
'use strict';
const $=id=>document.getElementById(id);let busy=false;
async function api(method='GET',body,suffix=''){
 const token=localStorage.getItem('bringness-pos-token');if(!token)throw Object.assign(Error('Bitte zuerst in Bringness anmelden.'),{status:401});
 const response=await fetch('/api/v1/fiskaly-test'+suffix,{method,cache:'no-store',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Einrichtung fehlgeschlagen.'),{status:response.status});return result;
}
function status(result){$('status').textContent=result.configured?(result.status==='connected'?'TEST-Zugang verbunden · TSE noch nicht eingerichtet':'TEST-Zugang gespeichert · Verbindung bitte prüfen'):'Noch kein TEST-Zugang gespeichert';$('testSaved').hidden=$('remove').hidden=!result.configured}
function setBusy(value){busy=value;$('credentials').setAttribute('aria-busy',String(value));for(const button of $('credentials').querySelectorAll('button'))button.disabled=value}
async function run(action){if(busy)return;setBusy(true);$('message').textContent='Bitte warten …';try{const result=await action();status(result);$('message').textContent=result.message||''}catch(error){$('message').textContent=error.name==='TimeoutError'?'Verbindung dauert zu lange. Bitte erneut versuchen.':error.message}finally{$('apiSecret').value='';$('apiSecret').type='password';$('eye').setAttribute('aria-pressed','false');$('eye').setAttribute('aria-label','API Secret anzeigen');setBusy(false)}}
$('eye').onclick=()=>{const show=$('apiSecret').type==='password';$('apiSecret').type=show?'text':'password';$('eye').setAttribute('aria-pressed',String(show));$('eye').setAttribute('aria-label',show?'API Secret verbergen':'API Secret anzeigen')};
$('credentials').onsubmit=event=>{event.preventDefault();run(()=>api('PUT',{apiKey:$('apiKey').value,apiSecret:$('apiSecret').value}))};
$('testSaved').onclick=()=>run(()=>api('POST',{},'/test'));
$('remove').onclick=()=>{if(confirm('Gespeicherte Fiskaly TEST-Zugangsdaten entfernen?'))run(()=>api('DELETE'))};
api().then(result=>{status(result);$('credentials').hidden=false}).catch(error=>{$('status').textContent=error.message;$('login').hidden=error.status!==401});
})();
