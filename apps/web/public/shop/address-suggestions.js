// Local suggestions only: partial addresses never leave the browser.
const cities=['Berlin','Bernau bei Berlin','Bergisch Gladbach','Bielefeld','Bochum','Bonn','Bottrop','Braunschweig','Bremen','Bremerhaven','Chemnitz','Cottbus','Darmstadt','Dortmund','Dresden','Duisburg','Düsseldorf','Erfurt','Erlangen','Essen','Flensburg','Frankfurt am Main','Frankfurt (Oder)','Freiburg im Breisgau','Fürth','Gelsenkirchen','Göttingen','Hagen','Halle (Saale)','Hamburg','Hamm','Hanau','Hannover','Heidelberg','Heilbronn','Herne','Hildesheim','Ingolstadt','Jena','Kaiserslautern','Karlsruhe','Kassel','Kiel','Koblenz','Köln','Krefeld','Leipzig','Leverkusen','Lübeck','Ludwigshafen am Rhein','Magdeburg','Mainz','Mannheim','Moers','Mönchengladbach','Mülheim an der Ruhr','München','Münster','Neuss','Nürnberg','Oberhausen','Offenbach am Main','Oldenburg','Osnabrück','Paderborn','Pforzheim','Potsdam','Recklinghausen','Regensburg','Remscheid','Reutlingen','Rostock','Saarbrücken','Salzgitter','Schwerin','Siegen','Solingen','Stuttgart','Trier','Ulm','Wiesbaden','Wolfsburg','Wuppertal','Würzburg'];
const normalize=value=>value.trim().toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu,'');
export function citySuggestions(query,country=''){
 const q=normalize(query),c=normalize(country);
 if(q.length<2||c&&!['de','deutschland','germany'].includes(c))return [];
 return cities.filter(city=>normalize(city).startsWith(q)).slice(0,10);
}
let postalReference;
export async function loadPostalReference(){
 if(!postalReference)postalReference=fetch('/api/v1/shop/address-reference',{credentials:'omit',cache:'force-cache',redirect:'error'}).then(async r=>{if(!r.ok)throw Error();const value=await r.json();if(value.country!=='DE'||!value.postcodes||typeof value.postcodes!=='object')throw Error();return value.postcodes;}).catch(e=>{postalReference=null;throw e;});return postalReference;
}
export function mountAddressSuggestions({form,inputs,loadReference=loadPostalReference}){
 const d=form.ownerDocument,list=d.createElement('datalist'),hint=d.createElement('p'),postalHint=d.createElement('p');let epoch=0,disposed=false,autoCity='',postalCities=[];
 list.id=inputs.city.id+'-suggestions';inputs.city.setAttribute('list',list.id);
 hint.textContent='Ort ab zwei Buchstaben wählen, z. B. Be → Berlin. Straße und Hausnummer bitte ergänzen.';postalHint.setAttribute('role','status');
 const source=d.createElement('a');source.href='https://www.geonames.org/';source.textContent='Ortsverzeichnis: GeoNames · CC BY 4.0';source.target='_blank';source.rel='noopener noreferrer';source.referrerPolicy='no-referrer';
 inputs.city.parentElement.after(hint,postalHint,list,source);inputs.postalCode.inputMode='text';inputs.country.placeholder='DE';
 const german=()=>!inputs.country.value.trim()||['de','deutschland','germany'].includes(normalize(inputs.country.value));
 function update(){list.replaceChildren(...[...new Set([...postalCities,...citySuggestions(inputs.city.value,inputs.country.value)])].slice(0,15).map(city=>{const o=d.createElement('option');o.value=city;return o;}));}
 function cityInput(){autoCity='';update();}
 function choose(){autoCity='';const city=[...postalCities,...cities].find(city=>normalize(city)===normalize(inputs.city.value));if(city&&german()){inputs.city.value=city;if(!inputs.country.value.trim()||['deutschland','germany'].includes(normalize(inputs.country.value)))inputs.country.value='DE';}update();}
 async function postal(){const current=++epoch,code=inputs.postalCode.value.trim();postalCities=[];postalHint.textContent='';update();if(!german()||!/^\d{5}$/.test(code))return;
  try{const reference=await loadReference();if(disposed||current!==epoch||code!==inputs.postalCode.value.trim()||!german())return;postalCities=Array.isArray(reference[code])?reference[code].filter(v=>typeof v==='string'&&v.length<=120):[];update();postalHint.textContent=postalCities.length?'Zu '+code+' gehört: '+postalCities.slice(0,8).join(', ')+'. Bitte genaue Anschrift prüfen.':'Zu dieser PLZ ist kein Ortsvorschlag verfügbar. Ort frei eingeben.';
   if(postalCities.length===1&&(!inputs.city.value.trim()||autoCity&&inputs.city.value===autoCity)){inputs.city.value=postalCities[0];autoCity=postalCities[0];if(!inputs.country.value.trim())inputs.country.value='DE';}
  }catch{if(!disposed&&current===epoch)postalHint.textContent='PLZ-Vorschläge derzeit nicht verfügbar. Ort frei eingeben.';}
 }
 const country=()=>{postalCities=[];update();postal();};inputs.city.addEventListener('input',cityInput);inputs.city.addEventListener('change',choose);inputs.country.addEventListener('input',country);inputs.postalCode.addEventListener('input',postal);
 return {dispose(){disposed=true;epoch++;inputs.city.removeEventListener('input',cityInput);inputs.city.removeEventListener('change',choose);inputs.country.removeEventListener('input',country);inputs.postalCode.removeEventListener('input',postal);list.remove();hint.remove();postalHint.remove();source.remove();}};
}
