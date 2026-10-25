import {readLicenceOverview} from './licence-client.js';
import {mountLicenceOverview} from './licence-ui.js';
import {setShopStatus} from './status-view.js';
const host=document.getElementById('licence-host'),getToken=()=>{try{return localStorage.getItem('bringness-pos-token')||'';}catch{return '';}};let mounted;
function start(){mounted?.dispose();if(window.top!==window.self||window.location.search||window.location.hash){const note=document.createElement('p');setShopStatus(note,'warning','Bitte die Lizenzübersicht direkt über „Mein Shop“ öffnen.');host.replaceChildren(note);return;}mounted=mountLicenceOverview({host,getToken,request:readLicenceOverview});}
window.addEventListener('pagehide',()=>mounted?.dispose());window.addEventListener('pageshow',e=>{if(e.persisted)start();});window.addEventListener('hashchange',start);start();
