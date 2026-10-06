export async function enqueueCenterReadyNotification(client,orderId){
 // Uses the caller's transaction so kitchen readiness and notification intent
 // either commit together or roll back together.
 return (await client.query(`INSERT INTO center_guest_notifications(order_id,event_type)
 SELECT o.id,'ready' FROM orders o JOIN center_order_payments cp ON cp.order_id=o.id
 WHERE o.id=$1 AND o.status='ready' AND cp.released_at IS NOT NULL AND cp.ready_at IS NOT NULL
 ON CONFLICT(order_id,event_type) DO NOTHING RETURNING id`,[orderId])).rows[0]||null;
}
