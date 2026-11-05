// Local suggestions only: partial addresses never leave the browser.
const cities=['Berlin','Bernau bei Berlin','Bergisch Gladbach','Bielefeld','Bochum','Bonn','Bottrop','Braunschweig','Bremen','Bremerhaven','Chemnitz','Cottbus','Darmstadt','Dortmund','Dresden','Duisburg','Düsseldorf','Erfurt','Erlangen','Essen','Flensburg','Frankfurt am Main','Frankfurt (Oder)','Freiburg im Breisgau','Fürth','Gelsenkirchen','Göttingen','Hagen','Halle (Saale)','Hamburg','Hamm','Hanau','Hannover','Heidelberg','Heilbronn','Herne','Hildesheim','Ingolstadt','Jena','Kaiserslautern','Karlsruhe','Kassel','Kiel','Koblenz','Köln','Krefeld','Leipzig','Leverkusen','Lübeck','Ludwigshafen am Rhein','Magdeburg','Mainz','Mannheim','Moers','Mönchengladbach','Mülheim an der Ruhr','München','Münster','Neuss','Nürnberg','Oberhausen','Offenbach am Main','Oldenburg','Osnabrück','Paderborn','Pforzheim','Potsdam','Recklinghausen','Regensburg','Remscheid','Reutlingen','Rostock','Saarbrücken','Salzgitter','Schwerin','Siegen','Solingen','Stuttgart','Trier','Ulm','Wiesbaden','Wolfsburg','Wuppertal','Würzburg'];
const normalize=value=>value.trim().toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu,'');
export function citySuggestions(query,country=''){
 const q=normalize(query),c=normalize(country);
 if(q.length<2||c&&!['de','deutschland','germany'].includes(c))return [];
 return cities.filter(city=>normalize(city).startsWith(q)).slice(0,10);
}
export function mountAddressSuggestions({form,inputs}){
 const d=form.ownerDocument,list=d.createElement('datalist'),hint=d.createElement('p');
 list.id=inputs.city.id+'-suggestions';inputs.city.setAttribute('list',list.id);
 hint.textContent='Ort ab zwei Buchstaben wählen, z. B. Be → Berlin. Weitere Orte sind frei eingebbar. Straße, Hausnummer und die genaue Postleitzahl bitte ergänzen oder aus dem Browser übernehmen.';
 inputs.city.parentElement.after(hint,list);
 inputs.postalCode.inputMode='text';inputs.country.placeholder='DE';
 function update(){list.replaceChildren(...citySuggestions(inputs.city.value,inputs.country.value).map(city=>{const o=d.createElement('option');o.value=city;return o;}));}
 function choose(){const city=cities.find(city=>normalize(city)===normalize(inputs.city.value));if(city&&citySuggestions(city,inputs.country.value).includes(city)){inputs.city.value=city;if(!inputs.country.value.trim()||['deutschland','germany'].includes(normalize(inputs.country.value)))inputs.country.value='DE';}update();}
 inputs.city.addEventListener('input',update);inputs.city.addEventListener('change',choose);inputs.country.addEventListener('input',update);
 return {dispose(){inputs.city.removeEventListener('input',update);inputs.city.removeEventListener('change',choose);inputs.country.removeEventListener('input',update);list.remove();hint.remove();}};
}
