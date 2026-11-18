import crypto from 'node:crypto';

// POS customer/licensing view. The legacy /platform/overview remains the numeric
// summary consumed by the existing system directory.
export function createPosAdminOverview(db){return async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname!=='/api/v1/platform/control/overview')return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true;};
 const token=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'')?.[1];
 if(!token)return send(401,{error:'Bitte anmelden'});
 if(req.method!=='GET')return send(405,{error:'Diese Übersicht erlaubt ausschließlich Lesen'});
 if([...url.searchParams].length)return send(400,{error:'Diese Übersicht benötigt keine Parameter'});
 const c=await db.connect();
 try{
  await c.query('BEGIN');
  const auth=(await c.query(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id
   JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true
   WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.status='active'
   AND NOT coalesce(u.must_change_password,false) FOR SHARE OF s,u,pa`,[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
  if(!auth){await c.query('ROLLBACK');return send(403,{error:'Nur Bringness-Plattformadministratoren'});}
  const result=(await c.query(`SELECT
   jsonb_build_object('companies',(SELECT count(*) FROM companies),'restaurants',(SELECT count(*) FROM restaurants),
    'activeFeatures',(SELECT count(*) FROM company_features WHERE status='active'),
    'payments',(SELECT count(*) FROM billing_transactions)) summary,
   coalesce((SELECT jsonb_agg(customer ORDER BY customer.created_at DESC,customer.id) FROM (
    SELECT c.id,c.name,c.created_at,
     (SELECT count(*)::int FROM restaurants r WHERE r.company_id=c.id) restaurant_count,
     (SELECT email FROM users u WHERE u.company_id=c.id AND u.role IN ('owner','admin') ORDER BY u.created_at,u.id LIMIT 1) owner_email,
     coalesce((SELECT jsonb_agg(jsonb_build_object('feature',f.feature_code,'status',f.status,'paymentStatus',f.payment_status,'endsAt',f.ends_at,'graceUntil',f.grace_until) ORDER BY f.feature_code) FROM company_features f WHERE f.company_id=c.id),'[]'::jsonb) features,
     coalesce((SELECT jsonb_agg(payment) FROM (
      SELECT bt.status,bp.code plan,bt.amount_cents AS "grossCents",bt.created_at AS "createdAt"
      FROM billing_transactions bt JOIN billing_plans bp ON bp.id=bt.plan_id WHERE bt.company_id=c.id
      ORDER BY bt.created_at DESC,bt.id DESC LIMIT 1
     ) payment),'[]'::jsonb) payments
    FROM companies c ORDER BY c.created_at DESC,c.id LIMIT 250
   ) customer),'[]'::jsonb) companies,
   coalesce((SELECT jsonb_agg(plan ORDER BY plan.code) FROM (
    SELECT code,name,amount_cents,currency FROM billing_plans
    WHERE code IN ('pos_base_monthly','restaurant_monthly','table_qr_monthly')
   ) plan),'[]'::jsonb) plans`)).rows[0];
  await c.query('COMMIT');
  return send(200,{...result,limited:Number(result.summary.companies)>250});
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
};}
