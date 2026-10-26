import {categories} from './departments.js?v=categories-20261026';
export const draftKey='bringness.marketplace.offer-drafts.v1';
export const offerKinds=Object.freeze(['physical','digital','service']);
export function validateOffer(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ungültiger Angebotsentwurf.');
 const text=(key,max,required=false)=>{const v=input[key];if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Bitte '+key+' vollständig und innerhalb der Feldgrenze angeben.');return v.trim();};
 const title=text('title',120,true),category=text('category',80,true),kind=text('kind',20,true);
 if(!categories.includes(category)||category==='Alle'||!offerKinds.includes(kind))throw Error('Kategorie oder Angebotsart ungültig.');
 const price=text('price',15,true);if(!/^\d{1,8}([.,]\d{1,2})?$/.test(price))throw Error('Preis mit höchstens zwei Nachkommastellen angeben.');
 const netCents=Math.round(Number(price.replace(',','.'))*100);if(!Number.isSafeInteger(netCents)||netCents<1)throw Error('Nettopreis muss größer als null sein.');
 const tax=text('tax',10,true);if(!['19','7','0','review'].includes(tax))throw Error('Steuersatz prüfen.');
 const stock=text('stock',8);if(kind==='physical'&&!/^\d{1,7}$/.test(stock))throw Error('Für Waren einen ganzzahligen Bestand angeben.');
 const gtin=text('gtin',14);if(gtin){if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin))throw Error('GTIN muss 8, 12, 13 oder 14 Ziffern enthalten.');const digits=[...gtin].map(Number);const check=digits.pop();if((10-digits.reverse().reduce((sum,n,i)=>sum+n*(i%2?1:3),0)%10)%10!==check)throw Error('Prüfziffer der GTIN stimmt nicht.');}
 const delivery=text('delivery',300,kind==='physical');
 const condition=text('condition',20,true);if(!['new','used','refurbished'].includes(condition))throw Error('Zustand auswählen.');
 return {title,category,kind,price:price.replace('.',','),netCents,tax,stock:kind==='physical'?stock:'',gtin,condition,sku:text('sku',60),description:text('description',4000,true),delivery:kind==='physical'?delivery:'',fulfilment:text('fulfilment',500,kind!=='physical')};
}
export function loadOffers(storage){const raw=storage.getItem(draftKey);if(!raw)return [];if(raw.length>600000)throw Error('Entwurfsspeicher ist zu groß.');const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>50)throw Error('Entwurfsspeicher ist ungültig.');return rows.map(row=>{if(!row||typeof row.id!=='string'||!/^offer-[a-f0-9-]{36}$/.test(row.id))throw Error('Entwurfskennung ungültig.');return {...validateOffer(row),id:row.id};});}
export function saveOffers(storage,rows){if(rows.length>50)throw Error('Höchstens 50 Entwürfe pro Sitzung.');const validated=rows.map(row=>({...validateOffer(row),id:row.id}));storage.setItem(draftKey,JSON.stringify(validated));}
