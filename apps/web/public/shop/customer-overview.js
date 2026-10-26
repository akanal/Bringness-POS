import {validateCart,cartKey,products} from './catalog.js?v=categories-20261026';
const ids=['overview-cart','overview-saved','overview-compare'];
function reset(){for(const id of ids)document.getElementById(id).textContent='–';}
function selectedCount(storage,key){const raw=storage.getItem(key)||'[]';if(raw.length>12000)throw Error();const value=JSON.parse(raw);if(!Array.isArray(value)||value.length>100||value.some(id=>typeof id!=='string'||!products.some(p=>p.id===id)))throw Error();return new Set(value).size;}
function refresh(){
 reset();if(document.hidden)return;
 try{const storage=window.sessionStorage,raw=storage.getItem(cartKey)||'{}';if(raw.length>12000)throw Error();const cart=validateCart(JSON.parse(raw));const counts=[Object.values(cart).reduce((sum,value)=>sum+value,0),selectedCount(storage,'bringness.shop.saved.v1'),selectedCount(storage,'bringness.shop.compare.v1')];counts.forEach((count,index)=>document.getElementById(ids[index]).textContent=String(count));document.getElementById('overview-status').textContent='Nur deine aktuelle Auswahl in diesem Tab. Keine Reservierung und keine Bestellung.';}
 catch{document.getElementById('overview-status').textContent='Die Browserauswahl ist hier nicht lesbar. Du kannst Warenkorb, Merkliste und Vergleich direkt im Marktplatz öffnen.';}
}
window.addEventListener('pageshow',refresh);window.addEventListener('focus',refresh);window.addEventListener('storage',refresh);document.addEventListener('visibilitychange',refresh);refresh();
