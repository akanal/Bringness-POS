import {assertShopRegistrationSchema} from './shop-registration-schema.js';
import {registrationFieldErrors} from '../apps/web/public/shop/registration-fields.js';
import crypto from 'node:crypto';
import {legacyPasswordHash} from './secret-derivation.js';
import {validPassword} from './password-policy.js';
import {validShopBuyerEmail} from './shop-buyer-contact.js';
import {uuid} from './shop-drafts.js';
import {shopError} from './shop-account.js';
export function normalizedShopRegistration(value){
 if(registrationFieldErrors(value,{passwordValid:validPassword,emailValid:validShopBuyerEmail}).length)throw shopError('INVALID_REGISTRATION');
 return {companyName:value.companyName.trim(),ownerName:value.ownerName.trim(),email:value.email.trim().toLowerCase(),password:value.password,street:value.street.trim(),postalCode:value.postalCode.trim(),city:value.city.trim(),country:value.country.trim()};
}
export async function migrateShopRegistration(db){
 await assertShopRegistrationSchema(db);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_registration_requests(
  request_id uuid PRIMARY KEY,input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 )`);
}
const result=(requestId,replay)=>({version:1,requestId,recorded:true,replay,loginRequired:true,canPay:false,canActivate:false,checkoutConnected:false});
// Internal candidate only, disabled by default: no route/startup/mail/provider hook.
// No auto-login, licence, trial or subscription is created by registration.
export async function registerShopAccount(pool,{enabled=false,requestId,registration,hashPassword=legacyPasswordHash}={}){
 if(enabled!==true)throw shopError('REGISTRATION_DISABLED');if(!uuid(requestId)||typeof hashPassword!=='function')throw shopError('INVALID_REGISTRATION');
 requestId=requestId.toLowerCase();
 const value=normalizedShopRegistration(registration),{password,...profile}=value;let passwordHash;
 try{passwordHash=await hashPassword(password);}catch{throw shopError('REGISTRATION_UNAVAILABLE');}
 if(typeof passwordHash!=='string'||!/^[a-f0-9]{128}$/.test(passwordHash))throw shopError('REGISTRATION_UNAVAILABLE');
 const digest=crypto.createHash('sha256').update(JSON.stringify({...profile,passwordHash})).digest('hex');let db;
 try{db=await pool.connect();}catch{throw shopError('REGISTRATION_UNAVAILABLE');}
 try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['shop-registration-request:'+requestId]);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['shop-registration-email:'+profile.email]);
  const old=(await db.query('SELECT * FROM shop_registration_requests WHERE request_id=$1 FOR UPDATE',[requestId])).rows[0];
  if(old){
   if(old.input_digest!==digest)throw shopError('REQUEST_CONFLICT');
   const user=(await db.query('SELECT id,status,role,email,password_hash FROM users WHERE id=$1 FOR SHARE',[old.user_id])).rows[0];
   if(!user||user.status!=='active'||user.role!=='owner'||user.email?.trim().toLowerCase()!==profile.email||user.password_hash!==passwordHash)throw shopError('REGISTRATION_REVIEW');
   await db.query('COMMIT');return result(requestId,true);
  }
  if((await db.query('SELECT 1 FROM users WHERE lower(btrim(email))=$1 LIMIT 1',[profile.email])).rows.length)throw shopError('EMAIL_UNAVAILABLE');
  const companyId=crypto.randomUUID(),userId=crypto.randomUUID();
  await db.query('INSERT INTO companies(id,name) VALUES($1,$2)',[companyId,profile.companyName]);
  await db.query("INSERT INTO users(id,company_id,email,password_hash,display_name,role,status) VALUES($1,$2,$3,$4,$5,'owner','active')",[userId,companyId,profile.email,passwordHash,profile.ownerName]);
  await db.query('INSERT INTO company_billing_profiles(company_id,company_name,contact_name,street,postal_code,city,country) VALUES($1,$2,$3,$4,$5,$6,$7)',[companyId,profile.companyName,profile.ownerName,profile.street,profile.postalCode,profile.city,profile.country]);
  await db.query('INSERT INTO shop_registration_requests(request_id,input_digest,user_id) VALUES($1,$2,$3)',[requestId,digest,userId]);
  await db.query('COMMIT');return result(requestId,false);
 }catch(e){await db.query('ROLLBACK');if(e.code==='23505')throw shopError('EMAIL_UNAVAILABLE');if(['REQUEST_CONFLICT','REGISTRATION_REVIEW','EMAIL_UNAVAILABLE'].includes(e.code))throw e;throw shopError('REGISTRATION_UNAVAILABLE');}finally{db.release();}
}
