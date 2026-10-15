import crypto from 'node:crypto';
import pg from 'pg';
import {planModuleBasket} from './module-checkout.js';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
export function createModuleQuoteHandler(db=pool){
 return async function handleModuleQuote(req,res){
  if(new URL(req.url,'http://localhost').pathname!=='/api/v1/billing/module-quote')return false;
  if(req.method!=='POST'){send(res,405,{error:'METHOD_NOT_ALLOWED'});return true;}
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token){send(res,401,{error:'UNAUTHORIZED'});return true;}
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  try {
  const user=(await db.query("SELECT u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'",[hash])).rows[0];
  if(!user){send(res,401,{error:'UNAUTHORIZED'});return true;}
  if(!['owner'].includes(user.role)){send(res,403,{error:'FORBIDDEN'});return true;}
  let raw='';
   for await(const part of req){raw+=part.toString();if(raw.length>8192)throw Error('PAYLOAD_TOO_LARGE');}
   const body=JSON.parse(raw);
   if(!Array.isArray(body.modules)||body.modules.length>12||body.modules.some(x=>typeof x!=='string'))throw Error('INVALID_MODULES');
   const ent=(await db.query("SELECT bp.code FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND ce.status='active' AND (ce.current_period_end IS NULL OR ce.current_period_end>now())",[user.company_id])).rows.map(x=>x.code);
   const features=(await db.query("SELECT feature_code FROM company_features WHERE company_id=$1 AND status='active' AND (ends_at IS NULL OR ends_at>now() OR grace_until>now())",[user.company_id])).rows.map(x=>x.feature_code);
   const activeModules=[...ent,...features.map(x=>({center:'center_monthly',table_qr:'table_qr_monthly',waiter_order:'waiter_order_monthly',personnel:'personnel_monthly',display_control:'display_control_monthly'}[x])).filter(Boolean)];
   const quote=planModuleBasket({base:ent.includes('pos_base_monthly'),download:ent.includes('download_license'),baseAccess:features.includes('pos_base'),tableQr:features.includes('table_qr'),activeModules,requestedModules:body.modules});
   send(res,200,{...quote,checkoutEnabled:false,notice:'Unverbindliche Vorschau. Keine Buchung und keine Freischaltung.'});
  }catch(e){const known=['BASE_LICENSE_REQUIRED','BASE_LICENSE_ALREADY_ACTIVE','EMPTY_BASKET','DUPLICATE_MODULE','CONFLICTING_OPERATING_MODES','MODULE_ALREADY_ACTIVE','UNKNOWN_MODULE','INVALID_MODULES'];const clientError=known.includes(e.message)||e instanceof SyntaxError;send(res,e.message==='PAYLOAD_TOO_LARGE'?413:clientError?400:500,{error:known.includes(e.message)?e.message:clientError?'INVALID_REQUEST':'INTERNAL_ERROR'});}
  return true;
 };
}
