import http from "node:http";
import pg from "pg";
import { handlePosLicenseWebhook } from "./pos-license-webhook-http.js";
import { createSandboxCheckout } from "./pos-license-sandbox-checkout.js";

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
  if (await handlePosLicenseWebhook(req, res, {
    lookupCheckout, pool, apiKey: process.env.MOLLIE_API_KEY
  })) return;
  res.writeHead(404); res.end();
});
server.listen(Number(process.env.PORT || 3000), "0.0.0.0");
