// Register an already-created Mollie test subscription in the isolated DB.
// Only the backend may call this after provider verification. Prevent retries
// from creating duplicate local subscriptions.
export async function registerSandboxMonthlySubscription(pool,{
 companyId,planCode,customerId,subscriptionId
}) {
 if (!companyId || !["online_pos","restaurant_module","qr_module"].includes(planCode) ||
     !/^cst_[A-Za-z0-9]+$/.test(String(customerId||"")) ||
     !/^sub_[A-Za-z0-9]+$/.test(String(subscriptionId||"")))
   return {registered:false,reason:"invalid_subscription_identity"};
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  const result=await client.query(
   "INSERT INTO sandbox_pos_monthly_subscriptions(company_id,plan_code,mollie_customer_id,mollie_subscription_id,status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT (company_id,plan_code) DO NOTHING RETURNING id",
   [companyId,planCode,customerId,subscriptionId]
  );
  if(result.rowCount===1){
   await client.query("COMMIT");
   return {registered:true,subscriptionRecordId:result.rows[0].id};
  }
  const existing=await client.query(
   "SELECT id,mollie_customer_id,mollie_subscription_id FROM sandbox_pos_monthly_subscriptions WHERE company_id=$1 AND plan_code=$2 FOR UPDATE",
   [companyId,planCode]
  );
  if(existing.rows[0]?.mollie_subscription_id===subscriptionId &&
     existing.rows[0]?.mollie_customer_id===customerId){
   await client.query("COMMIT");
   return {registered:true,alreadyRegistered:true,subscriptionRecordId:existing.rows[0].id};
  }
  await client.query("ROLLBACK");
  return {registered:false,reason:"existing_subscription_conflict"};
 }catch(error){
  await client.query("ROLLBACK");
  throw error;
 }finally{client.release();}
}
