import {categories} from './departments.js?v=categories-20261026';
export const offerId=value=>typeof value==='string'&&/^offer-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const offerKinds=Object.freeze(['physical','digital','service']);
export function validateOffer(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ungültiger Angebotsentwurf.');
 const text=(key,max,required=false)=>{const v=input[key];if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Bitte '+key+' vollständig und innerhalb der Feldgrenze angeben.');return v.trim();};
 const workflow=input.workflow;if(workflow!==undefined&&!['draft','paused','sold'].includes(workflow))throw Error('Bearbeitungsstatus ungültig.');
 const title=text('title',120,true),category=text('category',80,true),kind=text('kind',20,true);
 if(!categories.includes(category)||category==='Alle'||!offerKinds.includes(kind))throw Error('Kategorie oder Angebotsart ungültig.');
 const price=text('price',15,true);if(!/^\d{1,8}([.,]\d{1,2})?$/.test(price))throw Error('Preis mit höchstens zwei Nachkommastellen angeben.');
 const netCents=Math.round(Number(price.replace(',','.'))*100);if(!Number.isSafeInteger(netCents)||netCents<1)throw Error('Nettopreis muss größer als null sein.');
 const tax=text('tax',10,true);if(!['19','7','0','review'].includes(tax))throw Error('Steuersatz prüfen.');
 const stock=text('stock',8);if(kind==='physical'&&!/^\d{1,7}$/.test(stock))throw Error('Für Waren einen ganzzahligen Bestand angeben.');
 const gtin=text('gtin',14);if(gtin){if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin))throw Error('GTIN muss 8, 12, 13 oder 14 Ziffern enthalten.');const digits=[...gtin].map(Number);const check=digits.pop();if((10-digits.reverse().reduce((sum,n,i)=>sum+n*(i%2?1:3),0)%10)%10!==check)throw Error('Prüfziffer der GTIN stimmt nicht.');}
 const delivery=text('delivery',300,kind==='physical');
 const condition=text('condition',20,true);if(!['new','used','refurbished'].includes(condition))throw Error('Zustand auswählen.');
 return {...(workflow&&workflow!=='draft'?{workflow}:{}),title,category,kind,price:price.replace('.',','),netCents,tax,stock:kind==='physical'?stock:'',gtin,condition,sku:text('sku',60),description:text('description',4000,true),delivery:kind==='physical'?delivery:'',fulfilment:text('fulfilment',500,kind!=='physical')};
}
