import {searchMatch} from './discovery-policy.js';
import {validateListingCatalog,listingQuery} from './listing-reference.js';
import {categoryMatches} from './departments.js?v=categories-20261026';
export const products = Object.freeze(validateListingCatalog([
  Object.freeze({id:'pos-online',listingNumber:'100001',name:'Bringness POS Online',category:'Software',tag:'Für deinen Geschäftsalltag',period:'monthly',netCents:3499,description:'Deine Kasse im Browser. Die Basis für Verkauf und Verwaltung, mit optionalen Modulen für deinen Betrieb.',features:['Online-Kasse und Verwaltung','Optionale Module separat buchen','Cloud-TSE im Basistarif vorgesehen'],notice:'Produktive TSE-Aktivierung bleibt ausstehend.'}),
  Object.freeze({id:'pos-download',listingNumber:'100002',name:'Bringness POS für Windows',category:'Software',tag:'Einmalige Basislizenz',period:'once',netCents:39900,description:'Die Windows-Variante mit eigener Basislizenz. Optionale Module werden separat im monatlichen Abo angeboten.',features:['Windows-Download','Einmalige Basislizenz','Optionale monatliche Zusatzmodule'],notice:'Offline- und Hardware-TSE-Integration sind noch nicht abgeschlossen. Hardware separat; kein sofortiger produktiver Einsatz zugesagt.'}),
  Object.freeze({id:'bringness-ai',listingNumber:'100003',name:'Bringness AI',category:'Software',tag:'Eigenständige Anwendung',period:null,netCents:null,description:'Bringness AI bleibt eine eigenständige Anwendung. Produktdetails und der endgültige Preis werden separat veröffentlicht.',features:['Getrennt von Bringness POS','Preis noch nicht festgelegt'],notice:'Noch nicht bestellbar.'})
]));
export const money = cents => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
export function filterProducts(query='',category='Alle') {
  const number=listingQuery(query);if(number)return products.filter(p=>p.listingNumber===number);
  return products.filter(p=>categoryMatches(p.category,category)&&searchMatch(p,query));
}
export function validateCart(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Ungültiger Warenkorb');
  const entries=Object.entries(value);
  if(entries.length>products.length)throw Error('Zu viele Artikel');
  for(const [id,quantity] of entries){const p=products.find(p=>p.id===id);if(!p||p.netCents===null||!Number.isInteger(quantity)||quantity<1||quantity>99)throw Error('Ungültiger Artikel oder Menge');}
  return Object.fromEntries(entries.sort(([a],[b])=>a.localeCompare(b)));
}
export function reviewCart(value) {
  const cart=validateCart(value);
  const lines=Object.entries(cart).map(([id,quantity])=>{const p=products.find(p=>p.id===id);return {id,name:p.name,quantity,period:p.period,unitNetCents:p.netCents,netCents:p.netCents*quantity};});
  const groups=['monthly','once'].map(period=>{const netCents=lines.filter(l=>l.period===period).reduce((n,l)=>n+l.netCents,0);const vatCents=Math.round(netCents*19/100);return {period,netCents,vatCents,grossCents:netCents+vatCents};}).filter(g=>g.netCents);
  return {lines,groups,canPay:false,canActivate:false};
}
export const cartKey='bringness.shop.cart.v2';
export function readCartState(storage){
 let raw;try{raw=storage.getItem(cartKey);}catch{return {cart:{},status:'unavailable'};}
 if(raw===null)return {cart:{},status:'empty'};
 try{return {cart:validateCart(JSON.parse(raw)),status:'saved'};}catch{return {cart:{},status:'invalid'};}
}
export function loadCart(storage){return readCartState(storage).cart;}
export function saveCart(storage,cart){try{storage.setItem(cartKey,JSON.stringify(validateCart(cart)));return true;}catch{return false;}}
