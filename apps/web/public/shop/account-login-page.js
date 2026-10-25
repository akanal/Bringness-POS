import {mountShopLogin} from './account-login-ui.js';
const host=document.getElementById('shop-login-host');let ui;
function start(){ui?.dispose();if(window.top!==window.self||window.location.search||!['','#review','#licences'].includes(window.location.hash)){host.textContent='Bitte die Anmeldung direkt über den Shop öffnen.';return;}try{ui=mountShopLogin({host,storage:localStorage,hash:window.location.hash});}catch{host.textContent='Die Anmeldung benötigt verfügbaren Browserspeicher. Du kannst dein bestehendes Konto auch in der Kasse öffnen.';}}
window.addEventListener('pagehide',()=>ui?.dispose());window.addEventListener('pageshow',e=>{if(e.persisted)start();});window.addEventListener('hashchange',start);start();
