// Reconcile the first Mollie payment before permitting a recurring mandate.
// This module never activates a license and never trusts a redirect/webhook.
import {monthlyGrossAmount} from "./pos-license-recurring-create.js";

export async function verifySandboxFirstPayment({
 apiKey,paymentId,customerId,companyId,planCode,fetcher=fetch
}) {
 if (!String(apiKey||"").startsWith("test_"))
   return {verified:false,reason:"sandbox_test_key_required"};
 if (!/^tr_[A-Za-z0-9]+$/.test(String(paymentId||"")) ||
     !/^cst_[A-Za-z0-9]+$/.test(String(customerId||"")) ||
     !companyId || !monthlyGrossAmount(planCode))
   return {verified:false,reason:"invalid_expected_payment"};
 const response=await fetcher("https://api.mollie.com/v2/payments/"+paymentId,{
   method:"GET",redirect:"error",
   headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},
   signal:AbortSignal.timeout(15000)
 });
 if (!response.ok) return {verified:false,reason:"provider_read_failed"};
 const payment=await response.json();
 if (payment.id!==paymentId || payment.mode!=="test" ||
     payment.customerId!==customerId || payment.sequenceType!=="first" ||
     String(payment.metadata?.bringnessCompanyId)!==String(companyId) ||
     payment.metadata?.bringnessPlanCode!==planCode ||
     payment.amount?.currency!=="EUR" ||
     payment.amount.value!==monthlyGrossAmount(planCode))
   return {verified:false,reason:"payment_identity_mismatch"};
 if (payment.status!=="paid") return {verified:false,reason:"payment_not_paid"};
 return {verified:true,paymentId,customerId,companyId,planCode};
}
