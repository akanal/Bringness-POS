import {marketplaceTestPreflight} from './shop-mollie-marketplace-preflight.js';
import {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {mollieFetch} from './mollie-request.js';

const fail=code=>{throw shopError(code);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const scopes='organizations.read profiles.read payments.read payments.write';
const cookiePattern=/^[a-f0-9]{64}$/;
const profilePattern=/^pfl_[A-Za-z0-9]{1,100}$/;
const tokenValid=s=>typeof s==='string'&&s.length>=10&&s.length<=4096&&!/\s/.test(s)&&!/^(test|live)_/.test(s);
export async function migrateMarketplaceConnections(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_mollie_connections(
 seller_company_id uuid PRIMARY KEY REFERENCES companies(id),connection_id uuid NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('pending','verified','revoked','reconnect_required')),
 merchant_id text,profile_id text,token_envelope text,expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_market_mollie_states(
 state_hash text PRIMARY KEY,seller_company_id uuid NOT NULL UNIQUE REFERENCES companies(id),session_hash text NOT NULL,
 browser_hash text NOT NULL,expires_at timestamptz NOT NULL)`);
}
// No default env lookup, generated runtime key, platform-key fallback or startup
// activation. The host must supply protected app credentials and a stable key.
export function createMarketplaceConnections(pool,{clientId,clientSecret,tokenKey,publicOrigin,fetcher=globalThis.fetch}={}){
 let origin;try{const u=new URL(publicOrigin);if(u.origin!==publicOrigin||u.protocol!=='https:')throw Error();origin=u.origin;}catch{fail('INVALID_MARKET_ORIGIN');}
 const configured=marketplaceTestPreflight({clientId,clientSecret,tokenKey,publicOrigin,fetcher}).configurationValid;
 const callback=origin+'/api/v1/shop/marketplace/merchant-callback';
 function requireConfig(){if(!configured)fail('MARKET_CONNECT_DISABLED');}
 function seal(tokens,seller,id){
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',Buffer.from(tokenKey,'hex'),iv);c.setAAD(Buffer.from('marketplace:test:'+seller+':'+id));
  const data=Buffer.concat([c.update(JSON.stringify(tokens),'utf8'),c.final()]);return [iv,c.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
 }
 function open(row){try{
  const parts=row.token_envelope.split('.');if(parts.length!==3)throw Error();const [iv,tag,data]=parts.map(s=>Buffer.from(s,'base64'));
  const d=createDecipheriv('aes-256-gcm',Buffer.from(tokenKey,'hex'),iv);d.setAAD(Buffer.from('marketplace:test:'+row.seller_company_id+':'+row.connection_id));d.setAuthTag(tag);
  const t=JSON.parse(Buffer.concat([d.update(data),d.final()]).toString('utf8'));if(!tokenValid(t.access_token)||!tokenValid(t.refresh_token))throw Error();return t;
 }catch{fail('MARKET_MERCHANT_NOT_CONNECTED');}}
 async function tx(session,fn){const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
  const first=await shopActor(db,session);await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[first.company_id]);
  const actor=await shopActor(db,session,true);if(actor.company_id!==first.company_id)fail('ACCOUNT_CHANGED');
  const seller=(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR UPDATE",[actor.company_id])).rows[0];
  if(!seller)fail('SELLER_NOT_APPROVED');const r=await fn(db,actor.company_id);await db.query('COMMIT');return r;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
 async function exchange(body){
  try{
   // The payment transport deliberately accepts /v2 only. OAuth has one fixed
   // separate endpoint, the same redirect/size/time/content-type protections.
   const r=await fetcher('https://api.mollie.com/oauth2/tokens',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64'),Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString()});
   let size=0;const chunks=[];for await(const chunk of r.body||[]){const b=Buffer.from(chunk);size+=b.length;if(size>65536)throw Error();chunks.push(b);}
   if(!r.ok||!/^application\/(?:json|hal\+json)(?:\s*;|\s*$)/i.test(r.headers.get('content-type')||''))throw Error();
   const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!tokenValid(value.access_token)||!tokenValid(value.refresh_token)||value.token_type?.toLowerCase()!=='bearer'||!Number.isSafeInteger(value.expires_in)||value.expires_in<60||value.expires_in>86400||typeof value.scope!=='string'||scopes.split(' ').some(s=>!value.scope.split(' ').includes(s)))throw Error();
   return value;
  }catch{fail('MARKET_CONNECT_FAILED');}
 }
 async function api(token,path){try{
  const r=await mollieFetch('https://api.mollie.com/v2/'+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}},fetcher);
  if(!r.ok||!/^application\/(?:json|hal\+json)(?:\s*;|\s*$)/i.test(r.headers.get('content-type')||''))throw Error();return await r.json();
 }catch{fail('MARKET_CONNECT_FAILED');}}
 async function loadConnection(seller){requireConfig();if(!uuid(seller))fail('INVALID_MARKET_INPUT');
  const r=(await pool.query(`SELECT c.* FROM shop_market_mollie_connections c JOIN shop_market_sellers s ON s.company_id=c.seller_company_id WHERE c.seller_company_id=$1 AND s.status='approved'`,[seller])).rows[0];
  return r?{kind:'mollie-oauth',mode:'test',status:r.status,sellerCompanyId:seller,connectionId:r.connection_id,merchantId:r.merchant_id,profileId:r.profile_id}:null;
 }
 async function withAccessToken(seller,id,fn,{pending=false}={}){
  requireConfig();if(!uuid(seller)||!uuid(id)||typeof fn!=='function')fail('INVALID_MARKET_INPUT');
  // Only refresh is serialized. Never hold this lock during adapter calls that
  // re-read the connection; refreshed credentials are durable before payment I/O.
  const db=await pool.connect();let access;
  try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
   const approved=(await db.query("SELECT 1 FROM shop_market_sellers WHERE company_id=$1 AND status='approved' FOR SHARE",[seller])).rows[0];
   if(!approved)fail('MARKET_MERCHANT_NOT_CONNECTED');
   const r=(await db.query('SELECT * FROM shop_market_mollie_connections WHERE seller_company_id=$1 AND connection_id=$2 FOR UPDATE',[seller,id])).rows[0];
   if(!r||!(pending?['pending','verified']:['verified']).includes(r.status))fail('MARKET_MERCHANT_NOT_CONNECTED');
   let t=open(r);
   if(new Date(r.expires_at).getTime()<=Date.now()+60000){
    try{t=await exchange({grant_type:'refresh_token',refresh_token:t.refresh_token});}
    catch{fail('MARKET_CONNECT_FAILED');}
    await db.query('UPDATE shop_market_mollie_connections SET token_envelope=$2,expires_at=clock_timestamp()+($3 * interval \'1 second\'),updated_at=clock_timestamp() WHERE seller_company_id=$1',[seller,seal({access_token:t.access_token,refresh_token:t.refresh_token},seller,id),t.expires_in]);
   }
   access=t.access_token;await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  const result=await fn(access);const current=await loadConnection(seller);
  if(!current||current.connectionId!==id||!(pending?['pending','verified']:['verified']).includes(current.status))fail('MARKET_MERCHANT_CHANGED');return result;
 }
 return {configured,loadConnection,withAccessToken,
  async status({token}){return tx(sessionHash(token),async(db,seller)=>{
   const r=(await db.query('SELECT status,merchant_id,profile_id FROM shop_market_mollie_connections WHERE seller_company_id=$1',[seller])).rows[0];
   return {configured,paymentMode:'test',status:r?.status||'not_connected',merchantId:r?.merchant_id||null,profileId:r?.profile_id||null,paymentsEnabled:false};
  });},
  async begin({token}){requireConfig();const session=sessionHash(token),state=randomBytes(32).toString('hex'),browserNonce=randomBytes(32).toString('hex');
   await tx(session,async(db,seller)=>{
    // Do not silently replace a binding while it owns unresolved/paid test intents.
    const active=(await db.query("SELECT 1 FROM shop_market_test_checkouts WHERE seller_company_id=$1 AND state NOT IN ('failed','expired','canceled') LIMIT 1",[seller])).rows[0];if(active)fail('MARKET_CONNECTION_IN_USE');
    await db.query(`INSERT INTO shop_market_mollie_states VALUES($1,$2,$3,$4,clock_timestamp()+interval '10 minutes') ON CONFLICT(seller_company_id) DO UPDATE SET state_hash=excluded.state_hash,session_hash=excluded.session_hash,browser_hash=excluded.browser_hash,expires_at=excluded.expires_at`,[hash(state),seller,session,hash(browserNonce)]);
   });const u=new URL('https://my.mollie.com/oauth2/authorize');for(const [k,v]of Object.entries({client_id:clientId,redirect_uri:callback,response_type:'code',scope:scopes,state,locale:'de_DE'}))u.searchParams.set(k,v);
   return {authorizationUrl:u.href,browserNonce};
  },
  async complete({state,code,error,browserNonce}){requireConfig();if(!cookiePattern.test(state||'')||!cookiePattern.test(browserNonce||''))fail('MARKET_CONNECT_STATE');
   // Consume once before token exchange. Lost replies require new explicit consent,
   // never replay a one-use provider code or replace a connection ambiguously.
   const saved=(await pool.query('DELETE FROM shop_market_mollie_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>clock_timestamp() RETURNING *',[hash(state),hash(browserNonce)])).rows[0];if(!saved)fail('MARKET_CONNECT_STATE');
   await tx(saved.session_hash,async(db,seller)=>{if(seller!==saved.seller_company_id)fail('ACCOUNT_CHANGED');});
   if(error)fail('MARKET_CONNECT_DENIED');if(typeof code!=='string'||!code||code.length>2048)fail('MARKET_CONNECT_STATE');
   const t=await exchange({grant_type:'authorization_code',code,redirect_uri:callback}),id=randomUUID();
   await tx(saved.session_hash,async(db,seller)=>{
    if(seller!==saved.seller_company_id)fail('ACCOUNT_CHANGED');
    const active=(await db.query("SELECT 1 FROM shop_market_test_checkouts WHERE seller_company_id=$1 AND state NOT IN ('failed','expired','canceled') LIMIT 1",[seller])).rows[0];if(active)fail('MARKET_CONNECTION_IN_USE');
    await db.query(`INSERT INTO shop_market_mollie_connections(seller_company_id,connection_id,status,token_envelope,expires_at) VALUES($1,$2,'pending',$3,clock_timestamp()+($4 * interval '1 second')) ON CONFLICT(seller_company_id) DO UPDATE SET connection_id=excluded.connection_id,status='pending',merchant_id=NULL,profile_id=NULL,token_envelope=excluded.token_envelope,expires_at=excluded.expires_at,updated_at=clock_timestamp()`,[seller,id,seal({access_token:t.access_token,refresh_token:t.refresh_token},seller,id),t.expires_in]);
   });return {connected:true,paymentsEnabled:false};
  },
  async verify({token,profileId}){requireConfig();if(!profilePattern.test(profileId||''))fail('INVALID_MARKET_INPUT');
   const session=sessionHash(token),binding=await tx(session,async(db,seller)=>{
    const r=(await db.query("SELECT connection_id FROM shop_market_mollie_connections WHERE seller_company_id=$1 AND status IN ('pending','verified')",[seller])).rows[0];if(!r)fail('MARKET_MERCHANT_NOT_CONNECTED');return {seller,id:r.connection_id};
   });
   const facts=await withAccessToken(binding.seller,binding.id,async access=>{
    const org=await api(access,'organizations/me'),profile=await api(access,'profiles/'+profileId);
    if(!/^org_[A-Za-z0-9]{1,100}$/.test(org?.id||'')||profile?.id!==profileId||profile.status!=='verified')fail('MARKET_PROFILE_NOT_READY');return {merchantId:org.id};
   },{pending:true});
   return tx(session,async(db,seller)=>{
    if(seller!==binding.seller)fail('ACCOUNT_CHANGED');
    const r=(await db.query('SELECT * FROM shop_market_mollie_connections WHERE seller_company_id=$1 FOR UPDATE',[seller])).rows[0];
    if(!r||r.connection_id!==binding.id||!['pending','verified'].includes(r.status))fail('MARKET_MERCHANT_CHANGED');
    if(r.status==='verified'&&(r.profile_id!==profileId||r.merchant_id!==facts.merchantId))fail('MARKET_CONNECTION_IN_USE');
    await db.query("UPDATE shop_market_mollie_connections SET status='verified',merchant_id=$2,profile_id=$3,updated_at=clock_timestamp() WHERE seller_company_id=$1",[seller,facts.merchantId,profileId]);return {status:'verified',paymentMode:'test',profileId,merchantId:facts.merchantId,paymentsEnabled:false};
   });
  },
  async disconnect({token}){requireConfig();return tx(sessionHash(token),async(db,seller)=>{
   await db.query("UPDATE shop_market_mollie_connections SET status='revoked',token_envelope=NULL,expires_at=NULL,updated_at=clock_timestamp() WHERE seller_company_id=$1",[seller]);
   await db.query('DELETE FROM shop_market_mollie_states WHERE seller_company_id=$1',[seller]);return {status:'revoked',paymentMode:'test',paymentsEnabled:false};
  });}
 };
}
