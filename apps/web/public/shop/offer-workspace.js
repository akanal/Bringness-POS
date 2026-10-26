import {categories} from './departments.js';
import {validateOffer} from './offer-policy.js';
export function preparationItems(value){
 const text=key=>typeof value?.[key]==='string'?value[key].trim():'';
 const kind=text('kind'),physical=kind==='physical',price=text('price');
 return [
  ['Titel',!!text('title')&&text('title').length<=120],
  ['Kategorie',categories.includes(text('category'))&&text('category')!=='Alle'],
  ['Angebotsart',['physical','digital','service'].includes(kind)],
  ['Beschreibung',!!text('description')&&text('description').length<=4000],
  ['Nettopreis',/^\d{1,8}([.,]\d{1,2})?$/.test(price)&&Number(price.replace(',','.'))>0],
  ['Steuerangabe prüfen',['0','7','19'].includes(text('tax'))],
  ...(physical?[
   ['Bestand',/^\d{1,7}$/.test(text('stock'))],
   ['Versand oder Abholung',!!text('delivery')&&text('delivery').length<=300]
  ]:[['Bereitstellung oder Leistungsumfang',!!text('fulfilment')&&text('fulfilment').length<=500]])
 ].map(([label,complete])=>({label,complete}));
}
export function singleOfferExport(input,{id,now=new Date()}={}){
 const offer=validateOffer(input);
 return {format:'bringness-offer-drafts',version:1,exportedAt:now.toISOString(),publication:'draft-only',offers:[{...offer,...(id?{id}:{})}]};
}
