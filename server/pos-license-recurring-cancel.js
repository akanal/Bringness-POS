// Provider-confirmed subscription cancellation in isolated sandbox.
// A cancellation stops future billing but must not erase paid access.
export async function reconcileSandboxSubscriptionCancellation(pool,{
 companyId,planCode,subscriptionId,providerStatus
}) {
 if(!companyId || !["online_pos","restaurant_module","qr_module"].includes(planCode) ||
    !/^sub_[A-Za-z0-9]+$/.test(String(subscriptionId||"")) ||
    !["canceled","completed"].includes(providerStatus))
   return {updated:false,reason:"invalid_cancellation"};
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  const found=await client.query(
   "SELECT id,status,paid_through FROM sandbox_pos_monthly_subscriptions WHERE company_id=$1 AND plan_code=$2 AND mollie_subscription_id=$3 FOR UPDATE",
   [companyId,planCode,subscriptionId]
  );
  if(found.rowCount!==1){
   await client.query("ROLLBACK");
   return {updated:false,reason:"subscription_not_registered"};
  }
  const record=found.rows[0];
  if(record.status==="canceled" || record.status==="expired"){
   await client.query("COMMIT");
   return {updated:false,alreadyProcessed:true};
  }
  await client.query(
   "UPDATE sandbox_pos_monthly_subscriptions SET status='canceled',updated_at=now() WHERE id=$1",
   [record.id]
  );
  await client.query("COMMIT");
  return {updated:true,paidThrough:record.paid_through};
 }catch(error){
  await client.query("ROLLBACK");
  throw error;
 }finally{client.release();}
}
