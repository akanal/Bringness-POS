import {offlineUuid} from './offline-sale-core.js';
const invalid=()=>{throw Object.assign(Error('Ungültige Seitenkennung'),{status:400});};
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3,6})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);
export function decodeAccountantCursor(raw,binding,{now=Date.now()}={}){
 if(typeof raw!=='string'||!raw||raw.length>768||!/^[A-Za-z0-9_-]+$/.test(raw))invalid();let value;
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(raw,'base64url')));}catch{invalid();}
 if(!value||typeof value!=='object'||Array.isArray(value)||value.binding!==binding||typeof value.id!=='string'||!offlineUuid.test(value.id)||!timestamp(value.date)||!timestamp(value.asOf)||Date.parse(value.asOf)>now+1000)invalid();return value;
}
