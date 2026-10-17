import { processPosLicenseWebhook } from "./pos-license-webhook-flow.js";

// Explicitly separate from the production POS HTTP router. The caller supplies
// checkout storage, isolated database, and Mollie TEST key.
export async function handlePosLicenseWebhook(req, res, dependencies) {
  if (new URL(req.url, "http://localhost").pathname !== "/sandbox/billing/mollie/webhook") return false;
  const respond = (status, body) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") {
    respond(405, { accepted: false, reason: "method_not_allowed" });
    return true;
  }
  if (!/^application\/x-www-form-urlencoded(?:\s*;|\s*$)/i.test(String(req.headers["content-type"] || ""))) {
    respond(415, { accepted: false, reason: "invalid_content_type" });
    return true;
  }
  let raw = "";
  try {
    for await (const chunk of req) {
      raw += chunk.toString();
      if (raw.length > 1024) { respond(413, { accepted: false, reason: "body_too_large" }); return true; }
    }
    const params = new URLSearchParams(raw);
    if ([...params.keys()].length !== 1 || params.getAll("id").length !== 1 ||
        !/^tr_[A-Za-z0-9]+$/.test(params.get("id") || "")) {
      respond(400, { accepted: false, reason: "invalid_payment_id" });
      return true;
    }
    const result = await processPosLicenseWebhook({ ...dependencies, paymentId: params.get("id") });
    respond(result.activated ? 200 : 202, { accepted: true, activated: result.activated === true });
  } catch {
    // No internal errors, payment metadata or credentials in the public response.
    respond(503, { accepted: false, reason: "temporary_failure" });
  }
  return true;
}
