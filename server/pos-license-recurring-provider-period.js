// Mollie subscription renewal periods are derived from provider-verified
// subscription dates, never from webhook fields or an arbitrary caller date.
// The caller must independently verify the payment as paid and belonging to
// this subscription before persisting the resulting entitlement.
const validId=(id,prefix)=>typeof id==="string"&&new RegExp("^"+prefix+"[A-Za-z0-9]+$").test(id);
export async function readVerifiedSandboxSubscriptionPeriod({
 apiKey,customerId,subscriptionId,fetcher=fetch
}){
 if(!String(apiKey||"").startsWith("test_"))
  return {verified:false,reason:"sandbox_test_key_required"};
 if(!validId(customerId,"cst_")||!validId(subscriptionId,"sub_"))
  return {verified:false,reason:"invalid_subscription_identity"};
 const response=await fetcher(
  "https://api.mollie.com/v2/customers/"+customerId+"/subscriptions/"+subscriptionId,{
  method:"GET",redirect:"error",
  headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)return {verified:false,reason:"provider_read_failed"};
 const subscription=await response.json();
 if(subscription.id!==subscriptionId||subscription.customerId!==customerId||
    subscription.mode!=="test"||!["active","canceled","completed"].includes(subscription.status))
  return {verified:false,reason:"provider_subscription_mismatch"};
 // nextPaymentDate is NOT an entitlement end: it may change for retries,
 // scheduling, cancellation, and payment processing delays.
 // Do not manufacture paidThrough from this date.
 return {verified:true,subscriptionId,customerId,status:subscription.status,
  nextPaymentDate:subscription.nextPaymentDate||null};
}
