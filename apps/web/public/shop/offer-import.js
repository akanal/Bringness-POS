import {validateOffer,offerId} from './offer-policy.js';
export const importLimits=Object.freeze({fileBytes:4000000,sourceRows:200,localRows:50,localCharacters:600000});
export function inspectOfferImport(text){
 if(typeof text!=='string'||text.length>importLimits.fileBytes||new TextEncoder().encode(text).length>importLimits.fileBytes)throw Error('Die Datei überschreitet die Grenze von 4 MB.');
 let value;try{value=JSON.parse(text);}catch{throw Error('Die Datei enthält kein lesbares JSON.');}
 if(!value||value.format!=='bringness-offer-drafts'||value.version!==1||value.publication!=='draft-only'||!Array.isArray(value.offers)||!value.offers.length||value.offers.length>importLimits.sourceRows)throw Error('Keine unterstützte Bringness-Sicherung mit 1 bis 200 Entwürfen.');
 return value.offers.map((row,index)=>{try{return {index,offer:validateOffer(row),error:null};}catch{return {index,offer:null,title:typeof row?.title==='string'?row.title.slice(0,120):'Eintrag '+(index+1),error:'Pflichtangaben, Kategorie, Preis, Bestand oder EAN prüfen. Dieser Eintrag kann nicht übernommen werden.'};}});
}
const normalized=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase('de');
export function importHints(entry,entries,existing){if(!entry.offer)return [];const offer=entry.offer,hints=[];if(offer.sku&&existing.some(row=>normalized(row.sku)===normalized(offer.sku)))hints.push('Artikelnummer bereits in deinen lokalen Entwürfen vorhanden.');if(offer.sku&&entries.some(row=>row.index!==entry.index&&row.offer&&normalized(row.offer.sku)===normalized(offer.sku)))hints.push('Artikelnummer mehrfach in dieser Datei.');if(existing.some(row=>normalized(row.title)===normalized(offer.title)))hints.push('Gleicher Titel bereits lokal vorhanden.');return hints;}
export function planOfferImport(entries,selection,existing,{newId=()=> 'offer-'+crypto.randomUUID()}={}){
 if(!Array.isArray(entries)||entries.length>200||!Array.isArray(selection)||!selection.length||new Set(selection).size!==selection.length||!Array.isArray(existing)||existing.length+selection.length>50)throw Error('Bitte gültige Einträge auswählen. Insgesamt sind höchstens 50 lokale Entwürfe möglich.');
 const ids=new Set(existing.map(row=>row.id)),added=selection.map(index=>{if(!Number.isInteger(index))throw Error('Ungültige Auswahl.');const entry=entries.find(row=>row.index===index);if(!entry?.offer)throw Error('Ein fehlerhafter Eintrag kann nicht übernommen werden.');const id=newId();if(!offerId(id)||ids.has(id))throw Error('Neue Kennung konnte nicht sicher erstellt werden. Bitte erneut prüfen.');ids.add(id);return {...validateOffer(entry.offer),id};});
 const next=[...existing,...added];if(JSON.stringify(next).length>importLimits.localCharacters)throw Error('Die Auswahl überschreitet die lokale Speichergrenze. Bitte weniger Einträge auswählen.');return {added,next};
}
