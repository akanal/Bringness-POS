import {createDownloadReviewClient} from './download-review-client.js';
import {downloadReviewLocation} from './download-review-view.js';
import {mountDownloadReview} from './download-review-ui.js';
import {setShopStatus} from './status-view.js';
const host=document.getElementById('download-review-host');
const token=()=>{try{return localStorage.getItem('bringness-pos-token')||'';}catch{return '';}};
let mounted;
function start(){
 mounted?.dispose();const id=window.top===window.self&&!window.location.search?downloadReviewLocation(window.location.hash):null;
 if(!id){const note=document.createElement('p');setShopStatus(note,'warning','Keine gültige Vorgangsnummer. Öffne die Prüfung über deine gespeicherte Zahlungsvorbereitung im Shop.');host.replaceChildren(note);return;}
 mounted=mountDownloadReview({host,id,client:createDownloadReviewClient({getToken:token}),getToken:token});
}
window.addEventListener('hashchange',start);window.addEventListener('pagehide',()=>mounted?.dispose());window.addEventListener('pageshow',e=>{if(e.persisted)start();});start();
