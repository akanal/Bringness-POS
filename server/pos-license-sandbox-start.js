import http from "node:http";
import pg from "pg";
import { handlePosLicenseWebhook } from "./pos-license-webhook-http.js";
import { createSandboxCheckout } from "./pos-license-sandbox-checkout.js";
import { confirmOwnerEmail } from "./pos-license-owner-confirmation.js";
import { processPosLicenseWebhook } from "./pos-license-webhook-flow.js";

// Separate billing-only entrypoint. Never import server/start.js (POS workers,
// restaurant routes, migrations or fiscal processing).
if (process.env.NODE_ENV !== "test" || !String(process.env.MOLLIE_API_KEY || "").startsWith("test_")) {
  throw new Error("Sandbox requires NODE_ENV=test and Mollie TEST credentials");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const lookupCheckout = async (paymentId) => {
  const result = await pool.query(
    `SELECT payment_id, company_id, plan_code, checkout_id, amount_cents,
            owner_email_confirmed_at
       FROM sandbox_pos_license_checkouts WHERE payment_id=$1`, [paymentId]);
  const row = result.rows[0];
  return row && {
    paymentId: row.payment_id, companyId: String(row.company_id), planCode: row.plan_code,
    checkoutId: row.checkout_id, amountCents: Number(row.amount_cents),
    ownerEmailConfirmed: row.owner_email_confirmed_at !== null, mode: "test"
  };
};
const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "pos-license-sandbox" }));
    return;
  }
  if (req.url === "/sandbox/billing/checkout" && req.method === "POST") {
    if (req.headers["content-type"] !== "application/json") { res.writeHead(415); res.end(); return; }
    // Only trusted internal callers with a separately provisioned sandbox token.
    const token = process.env.SANDBOX_CHECKOUT_TOKEN;
    if (!token || token.length < 32 || req.headers.authorization !== "Bearer " + token) { res.writeHead(403); res.end(); return; }
    try {
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 2048) { res.writeHead(413); res.end(); return; } }
      const data = JSON.parse(body);
      const result = await createSandboxCheckout({pool,apiKey:process.env.MOLLIE_API_KEY,companyId:data.companyId,ownerEmail:data.ownerEmail,baseUrl:process.env.SANDBOX_PUBLIC_BASE_URL});
      res.writeHead(201,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(result));
    } catch { res.writeHead(422,{"content-type":"application/json"});res.end(JSON.stringify({error:"checkout_unavailable"})); }
    return;
  }
  // Redirects are informational only. GET must never activate a license.
  if (req.method === "GET" && req.url?.startsWith("/sandbox/billing/return?")) {
    res.writeHead(200, {"content-type":"text/plain; charset=utf-8","cache-control":"no-store"});
    res.end("Payment return received. License activation requires confirmed owner email and verified Mollie payment.");
    return;
  }
  if (req.url === "/sandbox/billing/owner/confirm" && req.method === "POST") {
    if (req.headers["content-type"] !== "application/json") { res.writeHead(415); res.end(); return; }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 512) { res.writeHead(413); res.end(); return; }
      }
      const { paymentId, token } = JSON.parse(body);
      const confirmed = await confirmOwnerEmail(pool, paymentId, token);
      // Return a final state only after provider reconciliation. Email ownership
      // confirmation alone is never evidence of a paid Mollie transaction.
      if (!confirmed) {
        res.writeHead(400, {"content-type":"application/json","cache-control":"no-store"});
        res.end(JSON.stringify({confirmed:false,activated:false}));
      } else {
        let outcome;
        try {
          outcome = await processPosLicenseWebhook({
            paymentId,lookupCheckout,pool,apiKey:process.env.MOLLIE_API_KEY
          });
        } catch {
          res.writeHead(503, {"content-type":"application/json","cache-control":"no-store"});
          res.end(JSON.stringify({confirmed:true,activated:false,reason:"provider_temporarily_unavailable"}));
          return;
        }
        res.writeHead(outcome.activated ? 200 : 202, {"content-type":"application/json","cache-control":"no-store"});
        res.end(JSON.stringify({confirmed:true,activated:outcome.activated === true}));
      }
    } catch {
      res.writeHead(400, {"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({confirmed:false}));
    }
    return;
  }
  if (await handlePosLicenseWebhook(req, res, {
    lookupCheckout, pool, apiKey: process.env.MOLLIE_API_KEY
  })) return;
  res.writeHead(404); res.end();
});
server.listen(Number(process.env.PORT || 3000), "0.0.0.0");
