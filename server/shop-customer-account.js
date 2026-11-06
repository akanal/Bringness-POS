import crypto from 'node:crypto';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {readShopRequestBody,assertEmptyShopRequest} from './shop-request-body.js';
import {postalAddressReference} from './address-check.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!==[...keys].sort().join())throw shopError('INVALID_CUSTOMER_ACCOUNT');};
const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v)||required&&!v.trim())throw shopError('INVALID_CUSTOMER_ACCOUNT');return v.trim();};
const empty=()=>({revision:0,profile:{name:'',email:'',phone:''},addresses:[],defaultAddressId:null,updatedAt:null});
export function customerCommand(c){
 exact(c,['requestId','expectedRevision','profile','addresses','defaultAddressId']);if(!uuid(c.requestId)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||c.expectedRevision>=2147483646)throw shopError('INVALID_CUSTOMER_ACCOUNT');
 exact(c.profile,['name','email','phone']);const profile={name:text(c.profile.name,120),email:text(c.profile.email,254),phone:text(c.profile.phone,40)};
 if(profile.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(profile.email)||profile.phone&&!/^[+()0-9 .\-/]{3,40}$/.test(profile.phone))throw shopError('INVALID_CUSTOMER_ACCOUNT');
 if(!Array.isArray(c.addresses)||c.addresses.length>10)throw shopError('INVALID_CUSTOMER_ACCOUNT');const ids=new Set();
 const addresses=c.addresses.map(a=>{exact(a,['id','label','name','street','postalCode','city','country']);if(!uuid(a.id)||ids.has(a.id.toLowerCase()))throw shopError('INVALID_CUSTOMER_ACCOUNT');ids.add(a.id.toLowerCase());const row={id:a.id.toLowerCase(),label:text(a.label,60,true),name:text(a.name,120,true),street:text(a.street,160,true),postalCode:text(a.postalCode,20,true),city:text(a.city,100,true),country:text(a.country,2,true).toUpperCase()};if(!/^[A-Z]{2}$/.test(row.country)||row.country==='DE'&&!/^\d{5}$/.test(row.postalCode))throw shopError('INVALID_CUSTOMER_ACCOUNT');return row;});
 const defaultAddressId=c.defaultAddressId===null?null:text(c.defaultAddressId,36).toLowerCase();if(addresses.length?!ids.has(defaultAddressId):defaultAddressId!==null)throw shopError('INVALID_CUSTOMER_ACCOUNT');
 return {requestId:c.requestId.toLowerCase(),expectedRevision:c.expectedRevision,profile,addresses,defaultAddressId};
}
export function createShopCustomerAccount(pool,{enabled=true,publicOrigin='https://bringness.de'}={}){
 let ready=false;const reference=JSON.stringify(postalAddressReference());
 const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
 async function transaction(req,write,work){const match=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'');if(!match)throw shopError('UNAUTHORIZED');const hash=sessionHash(match[1]),db=await pool.connect();try{await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash,write);const result=await work(db,actor.company_id);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 return {async migrate(){if(!enabled)return;await pool.query(`CREATE TABLE IF NOT EXISTS shop_customer_accounts(company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,revision integer NOT NULL CHECK(revision>0),profile jsonb NOT NULL,addresses jsonb NOT NULL CHECK(jsonb_typeof(addresses)='array' AND jsonb_array_length(addresses)<=10),default_address_id uuid,updated_at timestamptz NOT NULL DEFAULT clock_timestamp())`);await pool.query(`CREATE TABLE IF NOT EXISTS shop_customer_account_commands(company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,request_id uuid NOT NULL,digest text NOT NULL,revision integer NOT NULL,PRIMARY KEY(company_id,request_id))`);ready=true;},async handle(req,res){
  const u=new URL(req.url,'http://local');if(!enabled||!['/api/v1/shop/customer-account','/api/v1/shop/address-reference'].includes(u.pathname))return false;
  try{
   if(u.search||req.headers['sec-fetch-site']==='cross-site')throw shopError('INVALID_CUSTOMER_ACCOUNT');
   if(u.pathname.endsWith('/address-reference')){if(req.method!=='GET'){send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}assertEmptyShopRequest(req);res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=3600','x-content-type-options':'nosniff'});res.end(reference);return true;}
   if(!ready)throw shopError('CUSTOMER_ACCOUNT_UNAVAILABLE');if(!['GET','POST'].includes(req.method)){send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
   let result;
   if(req.method==='GET'){assertEmptyShopRequest(req);result=await transaction(req,false,async(db,id)=>{const r=(await db.query('SELECT revision,profile,addresses,default_address_id,updated_at FROM shop_customer_accounts WHERE company_id=$1',[id])).rows[0];return r?{revision:r.revision,profile:r.profile,addresses:r.addresses,defaultAddressId:r.default_address_id,updatedAt:new Date(r.updated_at).toISOString()}:empty();});}
   else{
    if(req.headers.origin!==publicOrigin)throw shopError('FORBIDDEN');if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))throw shopError('INVALID_CUSTOMER_ACCOUNT');
    const c=customerCommand(await readShopRequestBody(req,{maxBytes:16384})),digest=crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
    result=await transaction(req,true,async(db,id)=>{await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['shop-customer:'+id]);const old=(await db.query('SELECT digest,revision FROM shop_customer_account_commands WHERE company_id=$1 AND request_id=$2',[id,c.requestId])).rows[0];if(old){if(old.digest!==digest)throw shopError('REQUEST_CONFLICT');return {requestId:c.requestId,revision:old.revision,replay:true};}const row=(await db.query('SELECT revision FROM shop_customer_accounts WHERE company_id=$1 FOR UPDATE',[id])).rows[0];if((row?.revision||0)!==c.expectedRevision)throw shopError('REVISION_CONFLICT');const revision=c.expectedRevision+1;await db.query(`INSERT INTO shop_customer_accounts(company_id,revision,profile,addresses,default_address_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id) DO UPDATE SET revision=EXCLUDED.revision,profile=EXCLUDED.profile,addresses=EXCLUDED.addresses,default_address_id=EXCLUDED.default_address_id,updated_at=clock_timestamp()`,[id,revision,JSON.stringify(c.profile),JSON.stringify(c.addresses),c.defaultAddressId]);await db.query('INSERT INTO shop_customer_account_commands(company_id,request_id,digest,revision) VALUES($1,$2,$3,$4)',[id,c.requestId,digest,revision]);return {requestId:c.requestId,revision,replay:false};});
   }
   send(res,200,result);
  }catch(e){const statuses={UNAUTHORIZED:401,FORBIDDEN:403,INVALID_CUSTOMER_ACCOUNT:400,INVALID_REQUEST:400,INVALID_BODY:400,BODY_TOO_LARGE:413,SHOP_BODY_TIMEOUT:408,REVISION_CONFLICT:409,REQUEST_CONFLICT:409};send(res,statuses[e.code]||503,{code:statuses[e.code]?e.code:'CUSTOMER_ACCOUNT_UNAVAILABLE'});}return true;
 }};
}
