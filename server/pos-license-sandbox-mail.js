// Test-only mail sink. Mailpit captures messages without sending email to real
// recipients. Never use this adapter in production.
export async function sendSandboxOwnerConfirmation({ ownerEmail, paymentId, token, baseUrl, fetcher = fetch }) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:") throw Error("https_required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(ownerEmail || ""))) throw Error("invalid_email");
  if (!/^tr_[A-Za-z0-9]+$/.test(String(paymentId || "")) || !/^[a-f0-9]{64}$/.test(String(token || ""))) throw Error("invalid_confirmation");
  const response = await fetcher("http://sandbox-mailpit:8025/api/v1/send", {
    method:"POST", redirect:"error", signal:AbortSignal.timeout(10000),
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      From:{Email:"no-reply@bringness.invalid",Name:"Bringness POS Sandbox"},
      To:[{Email:ownerEmail}],
      Subject:"Bringness POS: E-Mail bestätigen (Testumgebung)",
      Text:"Diese Nachricht wurde nur in der isolierten Mailpit-Testmailbox gespeichert.\n" +
        "Zahlung: "+paymentId+"\nBestätigungscode: "+token+"\n" +
        "Den Code im Bestätigungsformular unter "+new URL("/sandbox/billing/owner/confirm",origin).href+" eingeben."
    })
  });
  if (!response.ok) throw Error("sandbox_mail_delivery_failed");
}
