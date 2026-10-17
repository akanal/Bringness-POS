const validCents=value=>(typeof value==='number'&&Number.isSafeInteger(value)||typeof value==='string'&&/^[0-9]+$/.test(value)&&Number.isSafeInteger(Number(value)))&&Number(value)>0;
const fail=message=>{throw Object.assign(Error(message),{status:409})};
export async function validateBillingJob(c,j){
 if(!j||!['subscription','commission'].includes(j.kind))fail('Unbekannte Abrechnungsart; kein Einzug');
 if(j.kind==='subscription'){
  const charge=(await c.query('SELECT q.* FROM ai_subscription_charges q JOIN ai_subscriptions s ON s.id=q.subscription_id WHERE q.id=$1 AND q.job_id=$2 AND s.account_id=$3 FOR SHARE OF q,s',[j.source_id,j.id,j.supplier_id])).rows[0];if(!charge||typeof j.supplier_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(j.supplier_id)||!validCents(j.net_cents)||!validCents(charge.net_cents)||Number(charge.net_cents)!==Number(j.net_cents)||!Array.isArray(j.order_ids)||j.order_ids.length||!Number.isFinite(+new Date(j.period_start))||!Number.isFinite(+new Date(j.period_end))||+new Date(j.period_start)>=+new Date(j.period_end)||+new Date(charge.starts_at)!==+new Date(j.period_start)||+new Date(charge.ends_at)!==+new Date(j.period_end))fail('Abo-Abrechnungsposition stimmt nicht überein');return {orders:[],subscription:charge.snapshot};
 }
 if(!Array.isArray(j.order_ids)||!j.order_ids.length||new Set(j.order_ids).size!==j.order_ids.length)fail('Abrechnungspositionen fehlen oder sind doppelt');
 if(j.order_ids.some(id=>typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))fail('Ungültige Bestellreferenz; kein Einzug');
 if(typeof j.supplier_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(j.supplier_id))fail('Ungültiger Lieferant; kein Einzug');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(j.month)))fail('Ungültiger Abrechnungsmonat; kein Einzug');
 const orders=(await c.query("SELECT o.id,o.product_name,o.net_cents,o.commission_bps,o.commission_cents,o.received_at,p.order_id paid FROM ai_orders o LEFT JOIN ai_commission_payments p ON p.order_id=o.id WHERE o.id=ANY($1::uuid[]) AND o.status='received' AND o.supplier_id=$2 AND to_char(o.received_at AT TIME ZONE 'Europe/Berlin','YYYY-MM')=$3 ORDER BY o.received_at,o.id FOR UPDATE OF o",[j.order_ids,j.supplier_id,j.month])).rows;
 if(orders.some(o=>!j.order_ids.includes(o.id))||new Set(orders.map(o=>o.id)).size!==orders.length)fail('Fremde Abrechnungsposition; kein Einzug');
 if(!validCents(j.net_cents)||orders.some(o=>!validCents(o.commission_cents)))fail('Ungültige Provisionsbeträge; kein Einzug');
 const total=orders.reduce((n,o)=>n+Number(o.commission_cents),0);
 if(!Number.isSafeInteger(total)||orders.length!==j.order_ids.length||orders.some(o=>o.paid)||total!==Number(j.net_cents))fail('Abrechnungsbetrag verändert; kein Einzug');return {orders,subscription:null};
}
