import {cleanMailAddress,enqueuePaidReceipt} from './transactional-mail.js';
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export function createPaymentCheckout(pool){
function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => raw += chunk);
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

async function currentUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const q = await pool.query(
    "SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'",
    [tokenHash]
  );
  return q.rows[0] || null;
}

return async function handlePaymentCheckout(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/api/v1/orders/checkout" || req.method !== "POST") return false;

  const user = await currentUser(req);
  if (!user) {
    send(res, 401, { error: "Nicht angemeldet" });
    return true;
  }
  if (user.role === "waiter") {
    send(res, 403, { error: "Dieser Bereich ist nur für die Restaurantverwaltung freigegeben" });
    return true;
  }

  let body;
  try { body = await readBody(req); }
  catch {
    send(res, 400, { error: "Ungültige Anfrage" });
    return true;
  }

  let receiptEmail='';try{if(body.receiptEmail)receiptEmail=cleanMailAddress(body.receiptEmail);}catch{send(res,400,{error:'Gültige Beleg-E-Mail erforderlich'});return true;}
  const items = Array.isArray(body.items) ? body.items : [];
  const payments = Array.isArray(body.payments) ? body.payments : [];
  const restaurantId = String(body.restaurantId || "");
  if (!restaurantId || !items.length) {
    send(res, 400, { error: "Betrieb und Warenkorb sind erforderlich" });
    return true;
  }
  if (!payments.length || payments.length > 2) {
    send(res, 400, { error: "Mindestens eine Zahlungsart ist erforderlich" });
    return true;
  }
  if (payments.some(p => !["cash", "card"].includes(String(p.method)) || !Number.isInteger(Number(p.amountCents)) || Number(p.amountCents) <= 0)) {
    send(res, 400, { error: "Ungültige Zahlungsaufteilung" });
    return true;
  }

  if (payments.some(p => p.method === "card") && body.externalCardConfirmed !== true) {
    send(res, 400, { error: "Externe Kartenzahlung muss vor dem Verbuchen bestätigt werden" });
    return true;
  }

  const ids = [...new Set(items.map(i => String(i.productId || "")).filter(Boolean))];
  if (!ids.length || ids.length !== items.length) {
    send(res, 400, { error: "Ungültiger Artikel im Warenkorb" });
    return true;
  }

  const products = await pool.query(
    "SELECT p.id,p.name,p.price_cents,p.tax_rate FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE p.id=ANY($1::uuid[]) AND p.restaurant_id=$2 AND r.company_id=$3 AND p.active=true",
    [ids, restaurantId, user.company_id]
  );
  if (products.rows.length !== ids.length) {
    send(res, 400, { error: "Ein oder mehrere Artikel sind nicht verfügbar" });
    return true;
  }

  const productMap = new Map(products.rows.map(p => [p.id, p]));
  const cleanItems = [];
  let totalCents = 0;
  for (const item of items) {
    const product = productMap.get(String(item.productId));
    const qty = Number(item.qty);
    if (!product || !Number.isFinite(qty) || qty <= 0 || qty > 999) {
      send(res, 400, { error: "Ungültige Menge" });
      return true;
    }
    totalCents += Math.round(Number(product.price_cents) * qty);
    cleanItems.push({ product, qty });
  }
  if (totalCents <= 0) {
    send(res, 400, { error: "Ungültiger Gesamtbetrag" });
    return true;
  }

  const paymentTotal = payments.reduce((sum, p) => sum + Number(p.amountCents), 0);
  if (paymentTotal !== totalCents) {
    send(res, 400, { error: "Zahlungsaufteilung stimmt nicht mit dem Gesamtbetrag überein" });
    return true;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = (await client.query(
      "INSERT INTO orders(restaurant_id,status,total_cents,closed_at) SELECT id,'paid',$2,now() FROM restaurants WHERE id=$1 AND company_id=$3 RETURNING id,created_at",
      [restaurantId, totalCents, user.company_id]
    )).rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      send(res, 403, { error: "Betrieb nicht erlaubt" });
      return true;
    }

    for (const item of cleanItems) {
      await client.query(
        "INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,$3,$4,$5,$6)",
        [order.id, item.product.id, item.product.name, item.product.price_cents, item.product.tax_rate, item.qty]
      );
    }
    for (const payment of payments) {
      await client.query(
        "INSERT INTO payments(order_id,method,amount_cents) VALUES($1,$2,$3)",
        [order.id, payment.method, Number(payment.amountCents)]
      );
    }

    const receiptNumber = "BN-" + new Date().getUTCFullYear() + "-" + String((await client.query("SELECT nextval('receipt_number_seq') n")).rows[0].n).padStart(6, "0");
    await client.query("INSERT INTO receipts(order_id,receipt_number) VALUES($1,$2)", [order.id, receiptNumber]);
    await client.query(
      "UPDATE receipts rc SET merchant_snapshot=(SELECT jsonb_build_object('businessName',COALESCE(NULLIF(b.company_name,''),co.name),'restaurantName',r.name,'street',COALESCE(b.street,''),'postalCode',COALESCE(b.postal_code,''),'city',COALESCE(b.city,''),'vatId',COALESCE(b.vat_id,'')) FROM orders ord JOIN restaurants r ON r.id=ord.restaurant_id JOIN companies co ON co.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=co.id WHERE ord.id=rc.order_id) WHERE rc.order_id=$1",
      [order.id]
    );
    await enqueuePaidReceipt(client,order.id,receiptEmail);
    await client.query("COMMIT");

    send(res, 201, {
      id: order.id,
      restaurantId,
      totalCents,
      status: "paid",
      createdAt: order.created_at,
      receiptNumber,
      emailStatus:receiptEmail?'queued':null,
      payments: payments.map(p => ({ method: p.method, amountCents: Number(p.amountCents) }))
    });
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

}
export const handlePaymentCheckout=createPaymentCheckout(pool);
