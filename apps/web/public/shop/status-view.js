// Presentation only: never grants payment, licence or invoice rights.
export const shopStatuses=Object.freeze(Object.fromEntries(Object.entries({
 draft:{tone:'neutral',label:'Entwurf'},
 quote:{tone:'info',label:'Preis bestätigt'},
 expired:{tone:'warning',label:'Abgelaufen'},
 failed:{tone:'error',label:'Gescheitert'},
 completed:{tone:'success',label:'Abgeschlossen'},
 canceled:{tone:'neutral',label:'Verworfen'},
 prepared:{tone:'neutral',label:'Vorbereitung gespeichert'},
 uncertain:{tone:'warning',label:'Unklarer Zahlungsstatus'},
 open:{tone:'info',label:'Zahlung noch offen'},
 paid:{tone:'success',label:'Zahlung erfasst · Lizenz weiterhin gesperrt'},
 checking:{tone:'neutral',label:'Wird geprüft'},
 warning:{tone:'warning',label:'Bitte prüfen'},
 unknown:{tone:'warning',label:'Unbekannter Status · bitte prüfen'}
}).map(([key,value])=>[key,Object.freeze(value)])));

export function setShopStatus(element,key,text){
 const known=Object.hasOwn(shopStatuses,key),status=shopStatuses[known?key:'unknown'];
 element.classList.add('shop-status');element.dataset.shopStatus=known?key:'unknown';element.dataset.tone=status.tone;
 element.textContent=known&&typeof text==='string'&&text.trim()?text:status.label;
 return element;
}
export function clearShopStatus(element){
 element.classList.remove('shop-status');delete element.dataset.shopStatus;delete element.dataset.tone;element.textContent='';
}
export function draftStatusKey(draft,now=Date.now()){
 if(draft?.status==='canceled')return 'canceled';
 if(draft?.status!=='draft')return 'unknown';
 if(draft.expired===true)return 'expired';
 const expiry=Date.parse(draft.expiresAt);
 if(!Number.isFinite(expiry))return 'unknown';
 return draft.expired||expiry<=now?'expired':'draft';
}
