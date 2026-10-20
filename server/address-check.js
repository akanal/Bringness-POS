import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
let postcodes=null;
try{postcodes=JSON.parse(gunzipSync(readFileSync(new URL('./data/de-postcodes.json.gz',import.meta.url))));}catch{/* Missing reference data is not evidence of a wrong customer address. */}
const normalize=s=>s.trim().toLocaleLowerCase('de-DE').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/g,' ').trim();
const sameCity=(input,expected)=>{
 const a=normalize(input),b=normalize(expected);
 // Accept a municipal name with a district suffix, but never a short prefix (e.g. Neu vs. Neu-Ulm).
 return a===b||(b.length>=4&&a.startsWith(b+' '));
};
export function checkAddress(value,{complete=false}={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ungültige Adresse');
 const r={};for(const key of ['street','postalCode','city','country']){
  if(value[key]!=null&&typeof value[key]!=='string'||String(value[key]||'').length>160||/[\x00-\x1f\x7f]/.test(value[key]||''))throw Error('Ungültige Adresse');
  r[key]=(value[key]||'').trim();
 }
 const issues=[];const issue=(fields,message)=>issues.push({fields,message});
 if(complete)for(const [key,label]of [['street','Straße und Hausnummer'],['postalCode','Postleitzahl'],['city','Ort'],['country','Land']])if(!r[key])issue([key],label+' bitte eingeben.');
 const german=['de','deu','deutschland','germany','bundesrepublik deutschland'].includes(normalize(r.country));
 if(!german)return {status:issues.length?'warning':'unverified',issues,message:'Für dieses Land ist kein PLZ-Ort-Abgleich hinterlegt. Straßen- und Hausnummernexistenz nicht geprüft.'};
 if(r.street&&!/(?=.*\p{L})(?=.*\d)/u.test(r.street))issue(['street'],'Bitte Straße und Hausnummer vollständig eingeben.');
 let found=false;
 if(r.postalCode){
  if(!/^\d{5}$/.test(r.postalCode))issue(['postalCode'],'Eine deutsche Postleitzahl muss aus fünf Ziffern bestehen.');
  else if(postcodes){
   const cities=postcodes[r.postalCode];
   if(!cities)issue(['postalCode'],'Diese Postleitzahl ist im PLZ-Verzeichnis nicht enthalten. Bitte prüfen.');
   else if(r.city){found=cities.some(city=>sameCity(r.city,city));if(!found)issue(['postalCode','city'],'PLZ und Ort passen laut Verzeichnis nicht zusammen. Zu '+r.postalCode+' gehört: '+cities.slice(0,5).join(', ')+(cities.length>5?' …':'')+'. Bitte prüfen.');}
  }
 }
 return {status:issues.length?'warning':found?'matched':'unverified',issues,message:(found?'PLZ und Ort stimmen laut Verzeichnis überein. ':!postcodes?'PLZ-Abgleich derzeit nicht verfügbar. ':'')+'Straßen- und Hausnummernexistenz nicht geprüft.',source:'GeoNames',sourceUrl:'https://www.geonames.org/',dataDate:'2026-10-20'};
}
