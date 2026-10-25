import {helpTopicFromHash} from './help-content.js';
import {mountShopHelp} from './help-ui.js';
const host=document.getElementById('help-host');
let mounted;
function start(){mounted?.dispose();mounted=mountShopHelp({host,initialTopic:helpTopicFromHash(window.location.hash)});}
window.addEventListener('hashchange',start);window.addEventListener('pagehide',()=>mounted?.dispose());window.addEventListener('pageshow',e=>{if(e.persisted)start();});start();
