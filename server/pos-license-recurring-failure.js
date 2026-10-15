// Apply provider-confirmed failed recurring payments without shortening
// existing paid access. Never treat a webhook payload as provider evidence.
export async function recordSandboxMonthlyPaymentFailure(pool,{
 companyId,planCode,subscriptionId,paymentId,decision
}) {
 if(decision?.action!=="payment_failed" || decision.providerPaymentId!==paymentId ||
    !/^tr_[A-Za-z0-9]+$/.test(String(paymentId||"")))
   return {recorded:false,reason:"provider_confirmation_required"};
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  const found=await client.query(
   "SELECT id,status,paid_through FROM sandbox_pos_monthly_subscriptions WHERE company_id=$1 AND plan_code=$2 AND mollie_subscription_id=$3 FOR UPDATE",
   [companyId,planCode,subscriptionId]
  );
  if(found.rowCount!==1){
   await client.query("ROLLBACK");
   return {recorded:false,reason:"subscription_not_registered"};
  }
  const row=found.rows[0];
  const inserted=await client.query(
   "INSERT INTO sandbox_pos_monthly_payments(mollie_payment_id,subscription_id,payment_status) VALUES($1,$2,'failed') ON CONFLICT (mollie_payment_id) DO NOTHING RETURNING mollie_payment_id",
   [paymentId,row.id]
  );
  if(!inserted.rowCount){
   await client.query("COMMIT");
   return {recorded:false,alreadyProcessed:true};
  }
  if(!["canceled","expired"].includes(row.status)){
   await client.query(
    "UPDATE sandbox_pos_monthly_subscriptions SET status='past_due',updated_at=now() WHERE id=$1",
    [row.id]
   );
  }
  await client.query("COMMIT");
  return {recorded:true,paidThrough:row.paid_through};
 }catch(error){
  await client.query("ROLLBACK");
  throw error;
 }finally{client.release();}
}
