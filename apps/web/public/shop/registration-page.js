import {mountShopRegistration} from './registration-ui.js';
const host=document.getElementById('shop-registration-host');let ui;
function start(){ui?.dispose();if(window.top!==window.self||window.location.search||!['','#review','#licences'].includes(window.location.hash)){host.textContent='Bitte die Registrierung direkt über den Shop öffnen.';return;}ui=mountShopRegistration({host,hash:window.location.hash});}
window.addEventListener('pagehide',()=>ui?.dispose());window.addEventListener('pageshow',e=>{if(e.persisted)start();});window.addEventListener('hashchange',start);start();
