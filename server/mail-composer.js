import crypto from 'node:crypto';
import {systemActor} from './system-access.js';
import {readJsonObject} from './http-body.js';
import {cleanMailAddress,enqueueMail} from './transactional-mail.js';
import {createMailProbe} from './ai-mail-health.js';
import {isolatedPreview} from './preview-policy.js';
import {composerFrom,supportAddress} from './mail-templates.js';
const base='/api/v1/platform/mail/composer';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(status,message)=>Object.assign(Error(message),{status});
function send(res,status,data){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true;}
export function validateComposedMail(input){
 if(Object.keys(input).some(k=>!['requestKey','to','subject','text'].includes(k))||typeof input.requestKey!=='string'||!uuid.test(input.requestKey))throw fail(400,'Ungültige Nachrichtenkennung.');
 if(typeof input.to!=='string'||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(input.to.trim()))throw fail(400,'Bitte genau eine gültige Empfängeradresse angeben.');
 const to=cleanMailAddress(input.to);
 if(typeof input.subject!=='string'||!input.subject.trim()||input.subject.length>160||/[\x00-\x1f\x7f]/.test(input.subject))throw fail(400,'Bitte einen Betreff mit höchstens 160 Zeichen eingeben.');
 if(typeof input.text!=='string'||!input.text.trim()||input.text.length>10000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.text))throw fail(400,'Bitte eine Nachricht mit höchstens 10.000 Zeichen eingeben.');
 return {requestKey:input.requestKey.toLowerCase(),to,subject:input.subject.trim(),text:input.text.replaceAll('\r\n','\n').trim()};
}
export function createMailComposer(pool,{probe=createMailProbe(),env=process.env}={}){
 return async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  if(path!==base&&!path.startsWith(base+'/'))return false;
  if(!await systemActor(pool,req,res))return true;
  if(isolatedPreview()||isolatedPreview(env))return send(res,403,{error:'Echter Mailversand ist in dieser Vorschau gesperrt.'});
  const item=path.slice(base.length+1);
  if(req.method==='GET'&&path===base)return send(res,200,{from:composerFrom,replyTo:supportAddress,smtp:await probe()});
  if(req.method==='GET'&&uuid.test(item)){
   const actor=await systemActor(pool,req,res);if(!actor)return true;
   const row=(await pool.query("SELECT id,status,created_at,sent_at FROM composed_mail WHERE id=$1 AND starts_with(dedupe_key,$2)",[item,'composer:'+actor.id+':'])).rows[0];
   return row?send(res,200,row):send(res,404,{error:'Nachricht nicht gefunden.'});
  }
  if(req.method!=='POST'||path!==base)return send(res,405,{error:'Methode nicht erlaubt.'});
  const origins=new Set(['https://bringness.de','https://bringness-pos.de']);
  if(!origins.has(req.headers.origin)||!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))return send(res,403,{error:'Ungültiger Ursprung oder Inhaltstyp.'});
  let client;
  try{
   const input=validateComposedMail(await readJsonObject(req,{maxBytes:49152}));
   client=await pool.connect();await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5s'");
   const actor=await systemActor(client,req,res);if(!actor){await client.query('ROLLBACK');return true;}
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mail-composer:'+actor.id]);
   const prefix='composer:'+actor.id+':'+input.requestKey+':';
   const fingerprint=crypto.createHash('sha256').update(JSON.stringify([input.to,input.subject,input.text])).digest('hex');
   const dedupe=prefix+fingerprint;
   let row=(await client.query('SELECT id,status,dedupe_key FROM composed_mail WHERE starts_with(dedupe_key,$1)',[prefix])).rows[0];
   if(row&&row.dedupe_key!==dedupe)throw fail(409,'Diese Nachrichtenkennung wurde bereits anders verwendet. Bitte zuerst den Versandstatus prüfen.');
   if(!row){
    const count=(await client.query("SELECT count(*)::int count FROM composed_mail WHERE starts_with(dedupe_key,$1) AND created_at>now()-interval '1 hour'",['composer:'+actor.id+':'])).rows[0].count;
    if(count>=20)throw fail(429,'Es sind höchstens 20 einzelne Nachrichten pro Stunde möglich.');
    await enqueueMail(client,dedupe,input.to,{kind:'composer',subject:input.subject,text:input.text},'composed_mail');
    row=(await client.query('SELECT id,status FROM composed_mail WHERE dedupe_key=$1',[dedupe])).rows[0];
   }
   await client.query('COMMIT');return send(res,202,{id:row.id,status:row.status});
  }catch(error){if(client)await client.query('ROLLBACK');return send(res,error.status||500,{error:error.status&&error.status<500?error.message:'Versandauftrag konnte nicht bestätigt werden. Bitte mit derselben Nachricht den Status prüfen.'});}
  finally{client?.release();}
 };
}
