import {validateCenterPayment} from './center-payment-core.js';
// Internal entry point. verifyPayment must read the provider API using the bound
// restaurant merchant credentials. It must not trust callback or guest fields.
export async function releaseCenterPayment(pool,paymentId,verifyPayment){
 const client=await pool.connect();
 try{
 await client.query('BEGIN');
 const binding=(await client.query(`SELECT cp.*,cr.merchant_reference current_merchant,cr.payment_status,cr.contract_status,cr.active
 FROM center_order_payments cp JOIN center_restaurants cr ON cr.center_id=cp.center_id AND cr.restaurant_id=cp.restaurant_id
 WHERE cp.payment_id=$1 FOR UPDATE OF cp`,[paymentId])).rows[0];
 if(!binding){await client.query('ROLLBACK');return {released:false,reason:'unknown_payment'};}
 if(binding.released_at){await client.query('COMMIT');return {released:false,alreadyReleased:true,orderId:binding.order_id};}
 if(!binding.active||binding.payment_status!=='verified'||binding.contract_status!=='signed'||binding.current_merchant!==binding.merchant_reference){await client.query('ROLLBACK');return {released:false,reason:'merchant_not_ready'};}
 const payment=await verifyPayment({paymentId:binding.payment_id,merchantReference:binding.merchant_reference});
 const result=validateCenterPayment({paymentId:binding.payment_id,orderId:binding.order_id,merchantReference:binding.merchant_reference,amountCents:binding.amount_cents,currency:binding.currency},payment);
 const paidAt=typeof payment?.paidAt==='string'?Date.parse(payment.paidAt):NaN;
 if(!result.release||!Number.isFinite(paidAt)||paidAt>Date.now()+60000){await client.query('ROLLBACK');return {released:false,reason:result.release?'invalid_payment_time':result.reason};}
 const order=await client.query(`UPDATE orders SET status='kitchen' WHERE id=$1 AND restaurant_id=$2 AND total_cents=$3 AND status='payment_pending' RETURNING id`,[binding.order_id,binding.restaurant_id,binding.amount_cents]);
 if(!order.rows.length){await client.query('ROLLBACK');return {released:false,reason:'order_not_pending'};}
 await client.query('UPDATE center_order_payments SET paid_at=$2,released_at=now() WHERE payment_id=$1',[paymentId,new Date(paidAt).toISOString()]);
 await client.query('COMMIT');return {released:true,orderId:binding.order_id};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function centerKitchenQueue(pool,restaurantId){
 return (await pool.query(`SELECT o.id,o.status,cp.paid_at,
 (SELECT coalesce(json_agg(json_build_object('name',oi.product_name_snapshot,'quantity',oi.quantity)),'[]'::json) FROM order_items oi WHERE oi.order_id=o.id) items
 FROM center_order_payments cp JOIN orders o ON o.id=cp.order_id
 WHERE cp.restaurant_id=$1 AND cp.released_at IS NOT NULL AND o.status IN ('kitchen','preparing','ready')
 ORDER BY cp.paid_at,cp.payment_id`,[restaurantId])).rows;
}
export async function advanceCenterKitchen(pool,restaurantId,orderId,nextStatus){
 if(!['preparing','ready'].includes(nextStatus))return {ok:false,reason:'invalid_status'};
 const client=await pool.connect();
 try{
 await client.query('BEGIN');
 await client.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',[restaurantId]);
 const order=(await client.query(`SELECT o.id,o.status FROM orders o JOIN center_order_payments cp ON cp.order_id=o.id
 WHERE o.id=$1 AND cp.restaurant_id=$2 AND o.restaurant_id=$2 AND cp.released_at IS NOT NULL FOR UPDATE OF o`,[orderId,restaurantId])).rows[0];
 if(!order){await client.query('ROLLBACK');return {ok:false,reason:'order_not_released'};}
 if(order.status===nextStatus){await client.query('COMMIT');return {ok:true,alreadyApplied:true};}
 if(nextStatus==='preparing'){
 if(order.status!=='kitchen'){await client.query('ROLLBACK');return {ok:false,reason:'invalid_transition'};}
 const first=(await client.query(`SELECT o.id FROM orders o JOIN center_order_payments cp ON cp.order_id=o.id
 WHERE cp.restaurant_id=$1 AND cp.released_at IS NOT NULL AND o.status='kitchen'
 ORDER BY cp.paid_at,cp.payment_id LIMIT 1`,[restaurantId])).rows[0];
 if(first?.id!==orderId){await client.query('ROLLBACK');return {ok:false,reason:'earlier_order_waiting'};}
 }else if(order.status!=='preparing'){await client.query('ROLLBACK');return {ok:false,reason:'invalid_transition'};}
 await client.query('UPDATE orders SET status=$2 WHERE id=$1',[orderId,nextStatus]);
 await client.query(nextStatus==='preparing'?'UPDATE center_order_payments SET preparation_started_at=now() WHERE order_id=$1':'UPDATE center_order_payments SET ready_at=now() WHERE order_id=$1',[orderId]);
 await client.query('COMMIT');return {ok:true,status:nextStatus};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
