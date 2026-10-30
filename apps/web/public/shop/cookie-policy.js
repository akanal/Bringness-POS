export const consentKey='bringness.shop.consent.v1';
export const preferenceKey='bringness.shop.browse.v1';
export function readChoice(storage){try{const v=JSON.parse(storage?.getItem(consentKey)||'null');return v?.version===1&&typeof v.preferences==='boolean'?v:null;}catch{return null;}}
export function preferencesAllowed(storage){return readChoice(storage)?.preferences===true;}
export function saveChoice(storage,preferences){
 const choice={version:1,preferences:preferences===true};
 try{if(!choice.preferences)storage.removeItem(preferenceKey);storage.setItem(consentKey,JSON.stringify(choice));return true;}catch{return false;}
}
