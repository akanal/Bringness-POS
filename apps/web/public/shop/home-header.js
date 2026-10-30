// Header location is a shortcut to the existing explicit location filter.
// It never asks for geolocation, stores coordinates or guesses a delivery address.
const open=document.getElementById('home-location-open');
const city=document.getElementById('location-city');
const label=document.getElementById('home-location-label');
if(open&&city&&label){
 const update=()=>{const value=city.value.trim();label.textContent=value||'Deiner Nähe';open.setAttribute('aria-label',value?'Angebotsstandort '+value+' ändern':'Angebotsstandort auswählen');};
 open.addEventListener('click',()=>{const toggle=document.getElementById('filter-toggle');if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();city.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});city.focus({preventScroll:true});});
 city.addEventListener('input',update);city.addEventListener('change',update);window.addEventListener('popstate',()=>queueMicrotask(update));
 document.addEventListener('click',()=>queueMicrotask(update));
 document.addEventListener('DOMContentLoaded',update,{once:true});
 update();
}
