export async function recoverGuestPayment(pool,statusToken,verifyPayment,env=process.env){
 if(env.CENTER_CHECKOUT_ENABLED!=='true'||!/^[a-f0-9]{64}$/.test(statusToken||''))return {checked:false};
 // Persist the poll claim before reading the provider so parallel guest tabs
 // cannot generate one provider request each.
 const row=(await pool.query(`UPDATE center_order_payments cp SET guest_checked_at=now()
 FROM orders o LEFT JOIN center_checkout_attempts a ON a.order_id=o.id
 WHERE cp.order_id=o.id AND cp.restaurant_id=o.restaurant_id
 AND (cp.guest_status_token=$1 OR a.guest_status_token=$1)
 AND o.created_at>now()-interval '24 hours' AND o.status='payment_pending'
 AND cp.released_at IS NULL AND coalesce(cp.provider_status,'') NOT IN ('failed','canceled','expired')
 AND (cp.guest_checked_at IS NULL OR cp.guest_checked_at<now()-interval '30 seconds')
 RETURNING cp.payment_id`,[statusToken])).rows[0];
 if(!row)return {checked:false};
 try{await verifyPayment(row.payment_id);return {checked:true};}
 catch{return {checked:true,unavailable:true};}
}
