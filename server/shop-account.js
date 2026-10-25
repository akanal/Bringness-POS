import crypto from 'node:crypto';
import {shopPreview} from './shop-preview-policy.js';
export function shopError(code){return Object.assign(Error(code),{code});}
export function sessionHash(token){if(typeof token!=='string'||!token||token.length>512)throw shopError('UNAUTHORIZED');return crypto.createHash('sha256').update(token).digest('hex');}
export async function shopActor(db,hash,lock=false){
 const actor=(await db.query(`SELECT u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.status='active' AND NOT coalesce(u.must_change_password,false) ${lock?'FOR SHARE OF s,u':''}`,[hash])).rows[0];
 if(!actor)throw shopError('UNAUTHORIZED');if(!['owner','admin'].includes(actor.role))throw shopError('FORBIDDEN');return actor;
}
export async function requireNoPendingBilling(db,companyId,{excludeGuardId=null}={}){
 const guard=await db.query("SELECT 1 FROM billing_checkout_guards WHERE company_id=$1 AND slot='base' AND status<>'resolved' AND ($2::uuid IS NULL OR id<>$2::uuid) LIMIT 1",[companyId,excludeGuardId]);
 const pending=await db.query("SELECT 1 FROM billing_transactions bt JOIN billing_plans bp ON bp.id=bt.plan_id WHERE bt.company_id=$1 AND bp.code IN ('pos_base_monthly','download_license','restaurant_monthly') AND (bt.status IN ('open','pending','authorized') OR (bt.status='paid' AND bt.paid_at IS NULL)) LIMIT 1",[companyId]);
 if(guard.rows.length||pending.rows.length)throw shopError('CHECKOUT_PENDING');
}
export async function loadShopPreview(db,companyId,cart,options={}){
 await requireNoPendingBilling(db,companyId,options);
 const plans=(await db.query('SELECT bp.code,bp.active,bp.currency,bp.billing_type,bp.amount_cents,t.monthly_net_cents FROM billing_plans bp LEFT JOIN company_billing_terms t ON t.plan_code=bp.code AND t.company_id=$1',[companyId])).rows;
 const entitlements=(await db.query('SELECT bp.code,ce.status,ce.current_period_end FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1',[companyId])).rows;
 const features=(await db.query('SELECT feature_code,status,payment_status,ends_at,grace_until FROM company_features WHERE company_id=$1',[companyId])).rows;
 const profile=(await db.query('SELECT company_name,street,postal_code,city,country FROM company_billing_profiles WHERE company_id=$1',[companyId])).rows[0]||{};
 const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
 return shopPreview({cart,plans,entitlements,features,profile,now});
}
export async function readShopPreview(pool,{token,cart}){
 const hash=sessionHash(token),db=await pool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");const actor=await shopActor(db,hash);const result=await loadShopPreview(db,actor.company_id,cart);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
