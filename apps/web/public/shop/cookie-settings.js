import {readChoice,saveChoice} from './cookie-policy.js';
export function mountCookieSettings(d){
 if(d.getElementById('shop-cookie-banner'))return;
 const w=d.defaultView;let storage;try{storage=w.localStorage;}catch{}
 const box=d.createElement('section');box.id='shop-cookie-banner';box.className='shop-cookie-banner';box.setAttribute('aria-labelledby','shop-cookie-title');box.setAttribute('role','region');
 box.innerHTML='<div><h2 id="shop-cookie-title">Deine Cookie- und Speichereinstellungen</h2><p>Wir verwenden technisch notwendigen Browserspeicher für Anmeldung, Warenkorb und von dir angeforderte Funktionen. Mit deiner Zustimmung merken wir uns zusätzlich Ansicht und Filter für deinen nächsten Besuch. Analyse- und Marketingdienste werden hier derzeit nicht eingesetzt.</p><a href="/datenschutz/">Datenschutz</a><p class="shop-cookie-status" role="status"></p></div><div class="shop-cookie-actions"><button type="button" data-choice="necessary">Nur notwendige</button><button type="button" data-choice="preferences">Komfortspeicherung erlauben</button></div>';
 const reopen=d.createElement('button');reopen.type='button';reopen.className='shop-cookie-reopen';reopen.textContent='Cookie-Einstellungen';reopen.setAttribute('aria-controls',box.id);
 const show=()=>{box.hidden=false;reopen.setAttribute('aria-expanded','true');};
 reopen.onclick=()=>{show();box.querySelector('button').focus();};
 for(const b of box.querySelectorAll('[data-choice]'))b.onclick=()=>{
  if(!saveChoice(storage,b.dataset.choice==='preferences')){box.querySelector('[role="status"]').textContent='Deine Auswahl konnte nicht gespeichert werden. Komfortspeicherung bleibt ausgeschaltet. Du kannst weiter stöbern.';return;}
  box.hidden=true;reopen.setAttribute('aria-expanded','false');reopen.focus();
  w.dispatchEvent(new w.CustomEvent('bringness:cookie-choice'));
 };
 box.hidden=Boolean(readChoice(storage));reopen.setAttribute('aria-expanded',String(!box.hidden));
 (d.querySelector('footer')||d.body).append(reopen);d.body.append(box);
}
if(typeof document!=='undefined')mountCookieSettings(document);
