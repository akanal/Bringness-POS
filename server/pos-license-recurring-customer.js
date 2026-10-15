// Create a Mollie customer only in TEST mode. No payments are initiated.
// Controller must authenticate the company and owner before calling this.
export async function createSandboxMollieCustomer({
 apiKey,companyId,ownerEmail,ownerName,fetcher=fetch
}) {
 if(!String(apiKey||"").startsWith("test_"))
  return {created:false,reason:"sandbox_test_key_required"};
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(companyId||"")) ||
    !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(ownerEmail||"")) ||
    typeof ownerName!=="string" || !ownerName.trim() || ownerName.length>150)
  return {created:false,reason:"invalid_customer_details"};
 const response=await fetcher("https://api.mollie.com/v2/customers",{
  method:"POST",redirect:"error",
  headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json",Accept:"application/json"},
  body:JSON.stringify({
   name:ownerName.trim(),email:ownerEmail,
   metadata:{bringnessCompanyId:String(companyId)}
  }),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)return {created:false,reason:"provider_customer_create_failed"};
 const customer=await response.json();
 if(!/^cst_[A-Za-z0-9]+$/.test(String(customer.id||"")) ||
    customer.mode!=="test" ||
    customer.email!==ownerEmail ||
    String(customer.metadata?.bringnessCompanyId)!==String(companyId))
  return {created:false,reason:"provider_customer_identity_mismatch"};
 return {created:true,customerId:customer.id,companyId};
}
