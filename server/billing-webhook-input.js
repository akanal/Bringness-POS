import {readRequestBytes} from './http-body.js';
export async function billingWebhookId(req){
 const bytes=await readRequestBytes(req,{maxBytes:1024});let raw;
 try{raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Object.assign(Error('Ungültige Anfrage'),{status:400,code:'INVALID_BODY'});}
 const form=new URLSearchParams(raw),ids=form.getAll('id');
 if(ids.length!==1||!/^tr_[A-Za-z0-9]{1,100}$/.test(ids[0]))throw Object.assign(Error('Ungültige Zahlungskennung'),{status:400,code:'INVALID_BODY'});
 return ids[0];
}
