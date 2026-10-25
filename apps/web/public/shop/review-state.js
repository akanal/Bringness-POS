import {draftStatusKey} from './status-view.js';
export function currentShopQuote(quote,now=Date.now()){
 return Boolean(quote&&Array.isArray(quote.issues)&&quote.issues.length===0&&Number.isFinite(Date.parse(quote.expiresAt))&&Date.parse(quote.expiresAt)>now);
}
export function shopDate(value){
 const at=new Date(value);if(!Number.isFinite(at.getTime()))return 'Unbekannt';
 return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(at);
}
export function draftPhase(draft){
 const key=draftStatusKey(draft);return key==='canceled'?'Entwurf verworfen':key==='expired'?'Entwurf abgelaufen':key==='draft'?'Entwurf gespeichert':'Unbekannter Entwurfsstatus · bitte prüfen';
}
