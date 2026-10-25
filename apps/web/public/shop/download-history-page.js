import {readDownloadHistory} from './download-history-client.js';
import {mountDownloadHistory} from './download-history-ui.js';
import {setShopStatus} from './status-view.js';
const host=document.getElementById('download-history-host'),token=()=>{try{return localStorage.getItem('bringness-pos-token')||'';}catch{return '';}};let mounted;
function start(){mounted?.dispose();if(window.top!==window.self||window.location.search||window.location.hash){const p=document.createElement('p');setShopStatus(p,'warning','Bitte den Windows-Kaufverlauf direkt über „Mein Shop“ öffnen. URL-Zusätze werden nicht verwendet.');host.replaceChildren(p);return;}mounted=mountDownloadHistory({host,getToken:token,request:readDownloadHistory});}
window.addEventListener('pagehide',()=>mounted?.dispose());window.addEventListener('pageshow',e=>{if(e.persisted)start();});window.addEventListener('hashchange',start);start();
