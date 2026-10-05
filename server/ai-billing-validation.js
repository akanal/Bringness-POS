const fail=message=>{throw Object.assign(Error(message),{status:409})};
export async function validateBillingJob(c,j){
 if(j.kind==='subscription'){
  const charge=(await c.query('SELECT * FROM ai_subscription_charges WHERE id=$1 AND job_id=$2 FOR SHARE',[j.source_id,j.id])).rows[0];if(!charge||Number(charge.net_cents)!==Number(j.net_cents)||j.order_ids.length||+new Date(charge.starts_at)!==+new Date(j.period_start)||+new Date(charge.ends_at)!==+new Date(j.period_end))fail('Abo-Abrechnungsposition stimmt nicht überein');return {orders:[],subscription:charge.snapshot};
 }
 const orders=(await c.query("SELECT o.id,o.product_name,o.net_cents,o.commission_bps,o.commission_cents,o.received_at,p.order_id paid FROM ai_orders o LEFT JOIN ai_commission_payments p ON p.order_id=o.id WHERE o.id=ANY($1::uuid[]) AND o.status='received' AND o.supplier_id=$2 ORDER BY o.received_at,o.id FOR UPDATE OF o",[j.order_ids,j.supplier_id])).rows;
 if(orders.length!==j.order_ids.length||orders.some(o=>o.paid)||orders.reduce((n,o)=>n+Number(o.commission_cents),0)!==Number(j.net_cents))fail('Abrechnungsbetrag verändert; kein Einzug');return {orders,subscription:null};
}
