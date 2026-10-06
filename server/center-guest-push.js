import crypto from 'node:crypto';
export function centerPushConfiguration(env=process.env){
 return env.CENTER_PUSH_ENABLED==='true'&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY
 ?{publicKey:env.VAPID_PUBLIC_KEY}:null;
}
export function validateGuestSubscription(subscription){
 const u=new URL(subscription?.endpoint||'');
 const allowed=u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com');
 if(u.protocol!=='https:'||u.port||u.username||u.password||!allowed||u.href.length>2048)throw Error('INVALID_PUSH_ENDPOINT');
 for(const [name,length] of [['p256dh',65],['auth',16]]){
  const value=subscription.keys?.[name];
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+={0,2}$/.test(value)||Buffer.from(value,'base64url').length!==length)throw Error('INVALID_PUSH_KEY');
 }
 return {endpoint:u.href,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}};
}
export async function saveGuestSubscription(pool,token,subscription,consent){
 if(consent!==true||!/^[a-f0-9]{64}$/.test(token||''))throw Error('INVALID_PUSH_CONSENT');
 const safe=validateGuestSubscription(subscription);
 const q=await pool.query(`WITH stored AS (INSERT INTO center_guest_push(order_id,subscription,endpoint_hash)
 SELECT o.id,$2::jsonb,$3 FROM orders o
 LEFT JOIN center_checkout_attempts a ON a.order_id=o.id
 LEFT JOIN center_order_payments cp ON cp.order_id=o.id
 WHERE (a.guest_status_token=$1 OR cp.guest_status_token=$1)
 AND o.created_at>now()-interval '24 hours' AND o.status<>'cancelled'
 ON CONFLICT(order_id) DO UPDATE SET subscription=EXCLUDED.subscription,endpoint_hash=EXCLUDED.endpoint_hash,updated_at=now()
 RETURNING order_id), rearmed AS (
 UPDATE center_guest_notifications n SET state='pending',attempts=0,claimed_at=NULL
 FROM stored s WHERE n.order_id=s.order_id AND n.state='failed' AND n.sent_at IS NULL
 RETURNING n.id
 ) SELECT order_id FROM stored`,[token,JSON.stringify(safe),crypto.createHash('sha256').update(safe.endpoint).digest('hex')]);
 return !!q.rows.length;
}
export async function dispatchCenterGuestPush(pool,sender){
 const jobs=(await pool.query(`WITH candidates AS (
 SELECT n.id FROM center_guest_notifications n JOIN center_guest_push s ON s.order_id=n.order_id
 JOIN orders o ON o.id=n.order_id WHERE o.status='ready' AND o.created_at>now()-interval '24 hours'
 AND n.attempts<5 AND (n.state='pending' OR (n.state='sending' AND n.claimed_at<now()-interval '2 minutes'))
 ORDER BY n.created_at,n.id LIMIT 10 FOR UPDATE OF n SKIP LOCKED
 ), claimed AS (
 UPDATE center_guest_notifications n SET state='sending',claimed_at=now(),attempts=attempts+1
 FROM candidates c WHERE n.id=c.id RETURNING n.id,n.order_id
 ) SELECT n.id,n.order_id,s.subscription,s.endpoint_hash,r.name restaurant_name,cp.guest_status_token,
 (SELECT min(rc.receipt_number) FROM receipts rc WHERE rc.order_id=n.order_id) collection_number
 FROM claimed n JOIN center_guest_push s ON s.order_id=n.order_id
 JOIN orders o ON o.id=n.order_id JOIN restaurants r ON r.id=o.restaurant_id
 JOIN center_order_payments cp ON cp.order_id=n.order_id`)).rows;
 for(const job of jobs){
  try{
   const active=await pool.query('SELECT 1 FROM center_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[job.order_id,job.endpoint_hash]);
   if(!active.rows.length){await pool.query("UPDATE center_guest_notifications SET state='pending' WHERE id=$1",[job.id]);continue;}
   const subscription=validateGuestSubscription(job.subscription);
   await sender(subscription,JSON.stringify({title:job.restaurant_name+' · Abholbereit',
    body:'Deine Bestellung '+(job.collection_number||'')+' ist abholbereit.',
    tag:'center-ready-'+job.order_id,url:'/center/status.html#token='+job.guest_status_token}));
   await pool.query("UPDATE center_guest_notifications SET state='sent',sent_at=now() WHERE id=$1 AND state='sending'",[job.id]);
  }catch(error){
   const expired=[404,410].includes(error.statusCode);
   if(expired)await pool.query('DELETE FROM center_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[job.order_id,job.endpoint_hash]);
   await pool.query("UPDATE center_guest_notifications SET state=CASE WHEN $2 OR attempts>=5 THEN 'failed' ELSE 'pending' END WHERE id=$1",[job.id,expired]);
  }
 }
 // Order-specific consent and subscriptions expire with the guest status link.
 await pool.query("DELETE FROM center_guest_push s USING orders o WHERE o.id=s.order_id AND o.created_at<=now()-interval '24 hours'");
 return jobs.length;
}

export async function manageGuestSubscription(pool,token,subscription,action){
 if(!/^[a-f0-9]{64}$/.test(token||'')||!['status','disable'].includes(action))throw Error('INVALID_PUSH_ACTION');
 const safe=validateGuestSubscription(subscription),hash=crypto.createHash('sha256').update(safe.endpoint).digest('hex');
 const order=(await pool.query(`SELECT o.id FROM orders o
 LEFT JOIN center_checkout_attempts a ON a.order_id=o.id
 LEFT JOIN center_order_payments cp ON cp.order_id=o.id
 WHERE (a.guest_status_token=$1 OR cp.guest_status_token=$1)
 AND o.created_at>now()-interval '24 hours'`,[token])).rows[0];
 if(!order)return {found:false};
 if(action==='disable'){
  await pool.query('DELETE FROM center_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[order.id,hash]);
  return {found:true,subscribed:false};
 }
 const q=await pool.query('SELECT 1 FROM center_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[order.id,hash]);
 return {found:true,subscribed:!!q.rows.length};
}
