const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const euro = cents => (Number(cents || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function createPublicReceiptHandler(pool) {
return async function handlePublicReceipt(req, res) {
  const match = new URL(req.url, "http://localhost").pathname.match(/^\/beleg\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  if (!match || req.method !== "GET") return false;
  const q = await pool.query(`SELECT rc.receipt_number,rc.issued_at,rc.fiscal_status,rc.merchant_snapshot,o.id order_id,o.total_cents,r.name restaurant_name,c.name company_name,b.company_name billing_name,b.street,b.postal_code,b.city,b.vat_id
    FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id JOIN companies c ON c.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=c.id WHERE rc.public_token=$1`, [match[1]]);
  if (!q.rowCount) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }); res.end("Beleg nicht gefunden"); return true; }
  const receipt = q.rows[0];
  if (receipt.merchant_snapshot) {
    const s = receipt.merchant_snapshot;
    receipt.restaurant_name = s.restaurantName; receipt.billing_name = s.businessName;
    receipt.street = s.street; receipt.postal_code = s.postalCode; receipt.city = s.city; receipt.vat_id = s.vatId;
  }
  const [itemRows, paymentRows] = await Promise.all([
    pool.query("SELECT product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity FROM order_items WHERE order_id=$1 ORDER BY id", [receipt.order_id]),
    pool.query("SELECT method,amount_cents FROM payments WHERE order_id=$1 ORDER BY created_at,id", [receipt.order_id]),
  ]);
  const taxes = new Map();
  const items = itemRows.rows.map(item => {
    const gross = Math.round(Number(item.unit_price_cents) * Number(item.quantity));
    const rate = Number(item.tax_rate_snapshot), vat = gross - Math.round(gross / (1 + rate / 100));
    const group = taxes.get(rate) || { gross: 0, vat: 0 };
    group.gross += gross; group.vat += vat; taxes.set(rate, group);
    return `<div class="row"><span>${esc(item.product_name_snapshot)}<small>${esc(Number(item.quantity).toLocaleString("de-DE"))} × ${euro(item.unit_price_cents)}</small></span><b>${euro(gross)}</b></div>`;
  }).join("");
  const taxRows = [...taxes].sort((a,b) => a[0]-b[0]).map(([rate,g]) => `<div class="row"><span>MwSt. ${esc(rate.toLocaleString("de-DE"))} %<small>Netto ${euro(g.gross-g.vat)} · Brutto ${euro(g.gross)}</small></span><b>${euro(g.vat)}</b></div>`).join("");
  const payments = paymentRows.rows.map(p => `<div class="row"><span>${esc(({cash:"Bar",card:"Karte",mollie_center:"Online-Zahlung"})[p.method] || p.method)}</span><b>${euro(p.amount_cents)}</b></div>`).join("");
  const address = [receipt.street, [receipt.postal_code, receipt.city].filter(Boolean).join(" ")].filter(Boolean).map(esc).join("<br>");
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Beleg ${esc(receipt.receipt_number)} – Bringness</title><style>body{margin:0;background:#f3f6f8;color:#10263c;font:16px system-ui,sans-serif}.receipt{box-sizing:border-box;max-width:520px;margin:24px auto;padding:28px;background:white;border-radius:16px;box-shadow:0 6px 24px #10223515}h1{font-size:23px;margin:0 0 4px}.brand{color:#ef6a16;font-weight:800}.muted,small{color:#52677a}small{display:block;margin-top:4px}.row{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid #e4e9ee}.row b{text-align:right;white-space:nowrap}.total{font-size:21px;font-weight:800}.warning{color:#9b2226;background:#fff1ef;padding:12px;border-radius:8px}.section{margin-top:22px}h2{font-size:17px;margin:0 0 8px}@media(max-width:550px){.receipt{margin:0;min-height:100vh;border-radius:0;padding:22px}}</style></head><body><main class="receipt"><div class="brand">Bringness</div><h1>${esc(receipt.restaurant_name)}</h1><div class="muted">${esc(receipt.billing_name || receipt.company_name)}${address ? `<br>${address}` : ""}${receipt.vat_id ? `<br>USt-IdNr.: ${esc(receipt.vat_id)}` : ""}</div><div class="section"><div>Beleg: <b>${esc(receipt.receipt_number)}</b></div><div>Datum: ${esc(new Date(receipt.issued_at).toLocaleString("de-DE", {timeZone:"Europe/Berlin"}))} Uhr</div></div><section class="section"><h2>Positionen</h2>${items}</section><div class="row total"><span>Gesamt</span><b>${euro(receipt.total_cents)}</b></div><section class="section"><h2>Zahlung</h2>${payments}</section><section class="section"><h2>Umsatzsteuer</h2>${taxRows}</section>${receipt.fiscal_status === "signed" ? "" : '<p class="warning">Nicht TSE-signiert – kein fiskalisierter Kassenbeleg.</p>'}</main></body></html>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow, noarchive", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
  res.end(html);
  return true;
}

;
}
