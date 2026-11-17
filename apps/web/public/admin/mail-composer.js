import {renderBringnessMail} from './mail-renderer.js';
const $=id=>document.getElementById(id),base='/api/v1/platform/mail/composer';
const fields=['to','subject','text'];
const session=localStorage.getItem('bringness-pos-token');
let requestKey=crypto.randomUUID(),messageId=null,locked=false,busy=false,mailStatus='';
const statusText={pending:'Nachricht ist vorgemerkt. Der Versand wird automatisch versucht.',sending:'Nachricht wird übergeben. Bitte warten und den Status prüfen.',sent:'An Versanddienst übergeben. Bitte den Eingang beim Empfänger prüfen.',review:'Der Übergabestatus ist unklar. Nicht erneut senden. Bitte die Zustellung beziehungsweise den Versanddienst prüfen.',failed:'Versand nicht abgeschlossen. Bitte den Versanddienst prüfen.'};
function current(){return session&&localStorage.getItem('bringness-pos-token')===session;}
async function api(path='',options={}){
 if(!current())throw Error('Bitte erneut in der Verwaltung anmelden.');
 const response=await fetch(base+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+session},cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!current()){location.reload();throw Error('Anmeldung wurde geändert.');}
 const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Anfrage konnte nicht bestätigt werden.'),{status:response.status});return data;
}
function preview(){
 $('previewSubject').textContent=$('subject').value.trim()||'Noch kein Betreff';
 const html=renderBringnessMail({text:$('text').value||'Guten Tag,\n\nIhre Nachricht erscheint hier.\n\nMit freundlichen Grüßen\nIhr Bringness-Team',logoUrl:location.origin+'/assets/bringness-logo.png'});
 $('preview').srcdoc=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src '+location.origin+'; style-src &#39;unsafe-inline&#39;">');
}
function controls(){for(const id of fields)$(id).readOnly=locked;$('send').disabled=busy||locked;$('reset').disabled=busy;$('check').disabled=busy;$('check').hidden=!locked;}
function applyStatus(data){messageId=data.id;mailStatus=data.status;$('notice').textContent=statusText[data.status]||'Versandstatus unbekannt. Bitte prüfen.';controls();}
async function submit(){
 if(busy)return;busy=true;locked=true;controls();$('notice').textContent='Versandauftrag wird geprüft…';
 try{applyStatus(await api('',{method:'POST',body:JSON.stringify({requestKey,...Object.fromEntries(fields.map(id=>[id,$(id).value]))})}));}
 catch(error){
  if([400,401,403,413,429].includes(error.status)){locked=false;$('notice').textContent=error.message;}
  else $('notice').textContent='Die Bestätigung fehlt. Die Nachricht bleibt gesperrt. Mit „Versandstatus prüfen“ wird dieselbe Kennung abgeglichen. '+error.message;
 }finally{busy=false;controls();}
}
$('compose').onsubmit=event=>{event.preventDefault();void submit();};
$('check').onclick=async()=>{if(busy)return;if(!messageId){await submit();return;}busy=true;controls();try{applyStatus(await api('/'+messageId));}catch(error){$('notice').textContent=error.message;}finally{busy=false;controls();}};
$('reset').onclick=()=>{
 if(locked&&!confirm(mailStatus==='sent'?'Eine neue Nachricht beginnen? Die vorherige E-Mail wurde bereits an den Versanddienst übergeben.':'Der vorherige Versand kann noch laufen oder unklar sein. Eine neue Nachricht könnte doppelt ankommen. Trotzdem eine neue Nachricht beginnen?'))return;
 if(!locked&&fields.some(id=>$(id).value)&&!confirm('Entwurf verwerfen und eine neue Nachricht beginnen?'))return;
 $('compose').reset();requestKey=crypto.randomUUID();messageId=null;mailStatus='';locked=false;$('notice').textContent='';controls();preview();$('to').focus();
};
for(const id of fields)$(id).addEventListener('input',preview);
window.addEventListener('storage',event=>{if(event.key==='bringness-pos-token')location.reload();});
window.addEventListener('beforeunload',event=>{if(fields.some(id=>$(id).value)&&mailStatus!=='sent'){event.preventDefault();event.returnValue='';}});
preview();
try{
 const config=await api();$('access').hidden=true;$('workspace').hidden=false;
 $('health').textContent=config.smtp.available?'Versanddienst erreichbar':'Versanddienst derzeit nicht bereit';
 if(!config.smtp.available)$('notice').textContent='Sie können einen Auftrag vormerken. Der Versand erfolgt, sobald der Dienst verfügbar ist.';
}catch(error){$('access').textContent=error.message;$('login').hidden=false;}
