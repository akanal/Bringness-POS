import {ensureManualPaymentAllowed} from './ai-collection.js';
import {aiPool} from './ai-database.js';
import {supplierRoles,uuid} from './ai-policy.js';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const period=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit'}).format(new Date());
const month=x=>{if(typeof x!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(x))fail('Monat im Format JJJJ-MM erforderlich');return x};
export async function migrateAiSettlements(){await aiPool().query(`
ALTER TABLE ai_orders ADD COLUMN IF NOT EXISTS received_at timestamptz;
UPDATE ai_orders SET received_at=updated_at WHERE status='received' AND received_at IS NULL;
CREATE INDEX IF NOT EXISTS ai_orders_received_period ON ai_orders(supplier_id,received_at) WHERE status='received';
CREATE TABLE IF NOT EXISTS ai_commission_deadlines(supplier_id uuid NOT NULL REFERENCES ai_accounts(id),month text NOT NULL,due_date date NOT NULL,recorded_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(supplier_id,month));
`)}
const filter="o.status='received' AND o.received_at>=($1||'-01')::date::timestamp AT TIME ZONE 'Europe/Berlin' AND o.received_at<((($1||'-01')::date+interval '1 month')::timestamp AT TIME ZONE 'Europe/Berlin')";
export async function settlementRoutes(p,method,b,u,url,admin=false){
 const base=admin?'/api/ai/admin/settlements':'/api/ai/settlements';
 if(!admin&&!supplierRoles.includes(u.role))fail('Nur Lieferanten haben Provisionsabrechnungen',403);
 if(p===base&&method==='GET'){
  const m=month(url.searchParams.get('month')||period());const supplier=url.searchParams.get('supplierId')||null;if(supplier&&!uuid.test(supplier))fail('Ungültiger Lieferant');if(!admin&&supplier&&supplier!==u.id)fail('Fremder Lieferant',403);
  const rows=(await aiPool().query(`SELECT o.supplier_id,s.business_name supplier_name,count(*)::int orders,sum(o.net_cents)::text net_cents,sum(o.commission_cents)::text commission_cents,coalesce(sum(pay.amount_cents),0)::text paid_cents,coalesce(sum(o.commission_cents) FILTER(WHERE pay.order_id IS NULL),0)::text outstanding_cents,d.due_date,(d.due_date<(now() AT TIME ZONE 'Europe/Berlin')::date AND coalesce(sum(o.commission_cents) FILTER(WHERE pay.order_id IS NULL),0)>0) overdue FROM ai_orders o JOIN ai_accounts s ON s.id=o.supplier_id LEFT JOIN ai_commission_payments pay ON pay.order_id=o.id LEFT JOIN ai_commission_deadlines d ON d.supplier_id=o.supplier_id AND d.month=$1 WHERE ${filter} AND ($2::boolean OR o.supplier_id=$3) AND ($4::uuid IS NULL OR o.supplier_id=$4) GROUP BY o.supplier_id,s.business_name,d.due_date ORDER BY s.business_name,o.supplier_id`,[m,admin,u.id,supplier])).rows;
  const details=supplier||!admin?(await aiPool().query(`SELECT o.id,o.product_name,o.net_cents,o.commission_bps,o.commission_cents,o.received_at,pay.reference,pay.recorded_at FROM ai_orders o LEFT JOIN ai_commission_payments pay ON pay.order_id=o.id WHERE ${filter} AND o.supplier_id=$2 ORDER BY o.received_at,o.id`,[m,admin?supplier:u.id])).rows:[];
  return {month:m,periodBasis:'Wareneingang, Europe/Berlin',provisional:m>=period(),rows,details,documentType:'Provisionsübersicht – keine Rechnung',automaticCollection:false};
 }
 if(!admin||method!=='POST')fail('Aktion nicht erlaubt',403);
 if(!uuid.test(String(b.supplierId)))fail('Ungültiger Lieferant');const m=month(b.month);
 if(p===base+'/deadline'){
  if(typeof b.dueDate!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(b.dueDate)||!Number.isFinite(Date.parse(b.dueDate))||new Date(b.dueDate).toISOString().slice(0,10)!==b.dueDate)fail('Gültiges Datum erforderlich');
  const c=await aiPool().connect();try{await c.query('BEGIN');if(!(await c.query('SELECT 1 FROM ai_accounts WHERE id=$1 AND role=ANY($2::text[])',[b.supplierId,supplierRoles])).rowCount)fail('Lieferant nicht gefunden',404);
   await c.query('INSERT INTO ai_commission_deadlines(supplier_id,month,due_date,recorded_by) VALUES($1,$2,$3,$4) ON CONFLICT(supplier_id,month) DO UPDATE SET due_date=excluded.due_date,recorded_by=excluded.recorded_by,updated_at=now()',[b.supplierId,m,b.dueDate,u.id]);
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'commission_deadline',$3)",[u.id,b.supplierId,JSON.stringify({month:m,dueDate:b.dueDate})]);await c.query('COMMIT');return {ok:true};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 if(p===base+'/payment'){
  if(typeof b.reference!=='string'||!b.reference.trim()||b.reference.trim().length>200||!Number.isSafeInteger(b.amountCents)||b.amountCents<=0||b.confirmed!==true)fail('Vollständigen Zahlungseingang mit Betrag und Nachweis bestätigen');
  const c=await aiPool().connect();try{await c.query('BEGIN');const orders=(await c.query(`SELECT o.id,o.commission_cents FROM ai_orders o WHERE ${filter} AND o.supplier_id=$2 AND o.commission_cents>0 ORDER BY o.id FOR UPDATE`,[m,b.supplierId])).rows;
   await ensureManualPaymentAllowed(c,orders.map(o=>o.id));const paid=new Set((await c.query('SELECT order_id FROM ai_commission_payments WHERE order_id=ANY($1::uuid[])',[orders.map(o=>o.id)])).rows.map(p=>p.order_id));const pending=orders.filter(o=>!paid.has(o.id));const amount=pending.reduce((n,o)=>n+Number(o.commission_cents),0);if(!amount||amount!==b.amountCents)fail('Offener Betrag geändert. Übersicht neu laden und Zahlung prüfen.',409);
   for(const o of pending)await c.query('INSERT INTO ai_commission_payments(order_id,amount_cents,reference,recorded_by) VALUES($1,$2,$3,$4)',[o.id,o.commission_cents,b.reference.trim(),u.id]);
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'commission_month_payment',$3)",[u.id,b.supplierId,JSON.stringify({month:m,amountCents:amount,reference:b.reference.trim(),orderIds:pending.map(o=>o.id)})]);await c.query('COMMIT');return {ok:true,paidCents:amount};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 fail('Aktion nicht gefunden',404);
}
