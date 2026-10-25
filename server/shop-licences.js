import crypto from 'node:crypto';
import {moduleCatalog} from './module-catalog.js';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {licenceStates,validLicenceOverview} from '../apps/web/public/shop/licence-state.js';
const base={pos_base_monthly:{name:'Bringness POS Online',period:'monthly'},download_license:{name:'Bringness POS für Windows',period:'once'},restaurant_monthly:{name:'Bestehender Restauranttarif',period:'monthly'}};
const plans=Object.freeze({...base,...Object.fromEntries(Object.entries(moduleCatalog).map(([code,m])=>[code,{name:m.name,period:'monthly'}]))});
// Recorded company entitlements only: no inference from TEST checkouts, paid
// receipts, current public prices, features, or a frontend success state.
export async function readShopLicenceOverview(pool,{token}){
 const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);
  const rows=(await db.query(`SELECT DISTINCT ON(bp.code) bp.code,ce.status,ce.provider,ce.current_period_end,ce.purchased_at FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code=ANY($2::text[]) ORDER BY bp.code,ce.created_at DESC NULLS LAST,ce.id DESC LIMIT 12`,[actor.company_id,Object.keys(plans)])).rows;
  const date=value=>value===null?null:new Date(value).toISOString();
  const items=rows.map(row=>{
   const p=plans[row.code];if(!p)throw shopError('SHOP_UNAVAILABLE');const provider=typeof row.provider==='string'?row.provider.trim().toLowerCase():'';const status=provider==='test'?'test':!provider?'unknown':Object.hasOwn(licenceStates,row.status)&&row.status!=='test'?row.status:'unknown';
   return {planCode:row.code,name:p.name,family:Object.hasOwn(base,row.code)?'base':'addon',period:p.period,status,periodEnd:date(row.current_period_end),purchasedAt:date(row.purchased_at),accessGranted:false};
  }).sort((a,b)=>(a.family==='base'?0:1)-(b.family==='base'?0:1)||a.name.localeCompare(b.name,'de'));
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now,value={version:1,scope:crypto.createHash('sha256').update('shop-licences:'+actor.company_id).digest('hex'),checkedAt:new Date(now).toISOString(),items,canPay:false,canActivate:false,canManage:false,checkoutConnected:false};if(!validLicenceOverview(value))throw shopError('SHOP_UNAVAILABLE');await db.query('COMMIT');return value;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
