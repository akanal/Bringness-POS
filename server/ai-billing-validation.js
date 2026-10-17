const fail=message=>{throw Object.assign(Error(message),{status:409})};
export async function validateBillingJob(c,j){
 if(j.kind==='subscription'){
  const charge=(await c.query('SELECT * FROM ai_subscription_charges WHERE id=$1 AND job_id=$2 FOR SHARE',[j.source_id,j.id])).rows[0];if(!charge||Number(charge.net_cents)!==Number(j.net_cents)||j.order_ids.length||+new Date(charge.starts_at)!==+new Date(j.period_start)||+new Date(charge.ends_at)!==+new Date(j.period_end))fail('Abo-Abrechnungsposition stimmt nicht überein');return {orders:[],subscription:charge.snapshot};
 }
 if(!Array.isArray(j.order_ids)||!j.order_ids.length||new Set(j.order_ids).size!==j.order_ids.length)fail('Abrechnungspositionen fehlen oder sind doppelt');
 if(j.order_ids.some(id=>typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))fail('Ungültige Bestellreferenz; kein Einzug');
 if(typeof j.supplier_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(j.supplier_id))fail('Ungültiger Lieferant; kein Einzug');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(j.month)))fail('Ungültiger Abrechnungsmonat; kein Einzug');
 const orders=(await c.query("SELECT o.id,o.product_name,o.net_cents,o.commission_bps,o.commission_cents,o.received_at,p.order_id paid FROM ai_orders o LEFT JOIN ai_commission_payments p ON p.order_id=o.id WHERE o.id=ANY($1::uuid[]) AND o.status='received' AND o.supplier_id=$2 AND to_char(o.received_at AT TIME ZONE 'Europe/Berlin','YYYY-MM')=$3 ORDER BY o.received_at,o.id FOR UPDATE OF o",[j.order_ids,j.supplier_id,j.month])).rows;
 if(orders.some(o=>!j.order_ids.includes(o.id))||new Set(orders.map(o=>o.id)).size!==orders.length)fail('Fremde Abrechnungsposition; kein Einzug');
 if(!Number.isSafeInteger(Number(j.net_cents))||Number(j.net_cents)<=0||orders.some(o=>!Number.isSafeInteger(Number(o.commission_cents))||Number(o.commission_cents)<=0))fail('Ungültige Provisionsbeträge; kein Einzug');
 if(orders.length!==j.order_ids.length||orders.some(o=>o.paid)||orders.reduce((n,o)=>n+Number(o.commission_cents),0)!==Number(j.net_cents))fail('Abrechnungsbetrag verändert; kein Einzug');return {orders,subscription:null};
}
