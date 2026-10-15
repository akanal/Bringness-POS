import {randomUUID} from "node:crypto";
export async function createSandboxCheckout({pool,apiKey,fetcher=fetch,companyId,ownerEmail,baseUrl}) {
 if (!String(apiKey || "").startsWith("test_")) throw Error("test_key_required");
 if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(companyId || ""))) throw Error("invalid_company");
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(ownerEmail || ""))) throw Error("invalid_owner_email");
 const origin=new URL(baseUrl);
 if (origin.protocol!=="https:") throw Error("https_required");
 const checkoutId=randomUUID();
 const payment=await fetcher("https://api.mollie.com/v2/payments",{
  method:"POST",redirect:"error",
  headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json",Accept:"application/json"},
  signal:AbortSignal.timeout(15000),
  body:JSON.stringify({
   amount:{currency:"EUR",value:"399.00"},
   description:"Bringness POS Downloadlizenz",
   redirectUrl:new URL("/sandbox/billing/return?checkout="+checkoutId,origin).href,
   webhookUrl:new URL("/sandbox/billing/mollie/webhook",origin).href,
   metadata:{bringnessCompanyId:companyId,bringnessPlanCode:"download_license",bringnessCheckoutId:checkoutId}
  })
 });
 if (!payment.ok) throw Error("provider_checkout_failed");
 const data=await payment.json();
 if (!/^tr_[A-Za-z0-9]+$/.test(String(data.id || "")) || !String(data._links?.checkout?.href || "").startsWith("https://")) throw Error("invalid_provider_checkout");
 await pool.query(
  "INSERT INTO sandbox_pos_license_checkouts(payment_id,company_id,plan_code,checkout_id,amount_cents,owner_email) VALUES($1,$2,$3,$4,$5,$6)",
  [data.id,companyId,"download_license",checkoutId,39900,ownerEmail]
 );
 return {checkoutId,paymentId:data.id,checkoutUrl:data._links.checkout.href};
}
