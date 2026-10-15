// Pure decision for initial recurring checkout reconciliation.
// The first payment is distinct from the later Mollie subscription.
// Only a verified paid first payment may advance to mandate checks.
export function decideSandboxMandateBootstrap({firstPayment,mandates,customerId}) {
  if (!firstPayment?.verified || firstPayment.customerId !== customerId ||
      !/^cst_[A-Za-z0-9]+$/.test(String(customerId || "")))
    return {ready:false,reason:"first_payment_not_verified"};
  if (!Array.isArray(mandates))
    return {ready:false,reason:"mandates_not_verified"};
  const valid = mandates.find(m => m?.status === "valid" &&
    m?.customerId === customerId && /^mdt_[A-Za-z0-9]+$/.test(String(m.id || "")));
  return valid ? {ready:true,mandateId:valid.id} : {ready:false,reason:"valid_mandate_missing"};
}
export async function verifySandboxRecurringMandate({
  apiKey,customerId,firstPayment,fetcher=fetch
}) {
  if (!String(apiKey||"").startsWith("test_"))
    return {ready:false,reason:"sandbox_test_key_required"};
  if (!firstPayment?.verified || firstPayment.customerId!==customerId ||
      !/^cst_[A-Za-z0-9]+$/.test(String(customerId||"")))
    return {ready:false,reason:"first_payment_not_verified"};
  const response=await fetcher("https://api.mollie.com/v2/customers/"+customerId+"/mandates",{
    method:"GET",redirect:"error",
    headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"},
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) return {ready:false,reason:"provider_mandate_read_failed"};
  const data=await response.json();
  return decideSandboxMandateBootstrap({
    firstPayment,customerId,mandates:data?._embedded?.mandates
  });
}
