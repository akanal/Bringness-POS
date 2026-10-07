import crypto from "node:crypto";
export function createPaymentReceiptHandler(pool,PDFDocument,QRCode,receiptUrl) {
function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function currentUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const q = await pool.query(
    "SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND coalesce(u.must_change_password,false)=false",
    [tokenHash]
  );
  return q.rows[0] || null;
}

const euro = cents => (Number(cents || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";

return async function handlePaymentReceipt(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const match = pathname.match(/^\/api\/v1\/receipts\/([0-9a-f-]{36})\/pdf$/);
  if (!match || req.method !== "GET") return false;

  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[1])){send(res,404,{error:'Beleg nicht gefunden'});return true;}
  const user = await currentUser(req);
  if (!user) {
    send(res, 401, { error: "Nicht angemeldet" });
    return true;
  }

  const receiptId = match[1];
  const q = await pool.query(
    "SELECT rc.receipt_number,rc.issued_at,rc.public_token,rc.fiscal_status,rc.merchant_snapshot,o.id order_id,o.total_cents,r.name restaurant_name,c.name company_name,b.company_name billing_name,b.street,b.postal_code,b.city,b.vat_id FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id JOIN companies c ON c.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=c.id WHERE rc.id=$1 AND c.id=$2",
    [receiptId, user.company_id]
  );
  if (!q.rowCount) {
    send(res, 404, { error: "Beleg nicht gefunden" });
    return true;
  }

  const receipt = q.rows[0];
  if (receipt.merchant_snapshot) {
    const snapshot = receipt.merchant_snapshot;
    receipt.restaurant_name = snapshot.restaurantName;
    receipt.billing_name = snapshot.businessName;
    receipt.street = snapshot.street;
    receipt.postal_code = snapshot.postalCode;
    receipt.city = snapshot.city;
    receipt.vat_id = snapshot.vatId;
  }

  const [itemsResult, paymentsResult] = await Promise.all([
    pool.query("SELECT product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity FROM order_items WHERE order_id=$1 ORDER BY id", [receipt.order_id]),
    pool.query("SELECT method,amount_cents,created_at FROM payments WHERE order_id=$1 ORDER BY created_at,id", [receipt.order_id]),
  ]);
  const items = itemsResult.rows;
  const payments = paymentsResult.rows;
  let qrBuffer;
  try {
    const qrPayload=receiptUrl(req,receipt.public_token);
    qrBuffer=await QRCode.toBuffer(qrPayload,{width:120,margin:1});
  } catch {
    send(res,503,{error:"Der Beleg konnte noch nicht als PDF erstellt werden. Bitte später erneut versuchen."});
    return true;
  }
  const height = Math.max(560, 390 + items.length * 34 + payments.length * 20);
  let pdf;
  try {
    pdf=await new Promise((resolve,reject)=>{
      const doc=new PDFDocument({size:[226.77,height],margin:18});
      const chunks=[];let size=0,settled=false;
      const fail=error=>{if(settled)return;settled=true;reject(error);doc.destroy?.();};
      doc.on('error',fail);
      doc.on('data',chunk=>{
        if(settled)return;
        try{const bytes=Buffer.from(chunk);size+=bytes.length;if(size>8*1024*1024){fail(Error('PDF_TOO_LARGE'));return;}chunks.push(bytes);}
        catch(error){fail(error);}
      });
      doc.once('end',()=>{if(settled)return;settled=true;resolve(Buffer.concat(chunks));});
      try{
  doc.fontSize(13).font("Helvetica-Bold").text(receipt.restaurant_name);
  doc.fontSize(9).font("Helvetica").text(receipt.billing_name || receipt.company_name);
  if (receipt.street) doc.text(receipt.street);
  if (receipt.postal_code || receipt.city) doc.text([receipt.postal_code, receipt.city].filter(Boolean).join(" "));
  if (receipt.vat_id) doc.text("USt-IdNr.: " + receipt.vat_id);
  doc.moveDown().text("Beleg: " + receipt.receipt_number);
  doc.text("Datum: " + new Date(receipt.issued_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) + " Uhr");
  doc.moveDown();

  const vat = new Map();
  let itemsTotal = 0;
  for (const item of items) {
    const gross = Math.round(Number(item.unit_price_cents) * Number(item.quantity));
    const rate = Number(item.tax_rate_snapshot);
    const tax = gross - Math.round(gross / (1 + rate / 100));
    itemsTotal += gross;
    const group = vat.get(rate) || { gross: 0, tax: 0 };
    group.gross += gross;
    group.tax += tax;
    vat.set(rate, group);
    doc.font("Helvetica-Bold").text(item.product_name_snapshot);
    doc.font("Helvetica").text(Number(item.quantity).toLocaleString("de-DE") + " x " + euro(item.unit_price_cents) + "    " + euro(gross), { align: "right" });
  }

  doc.moveDown().font("Helvetica-Bold").text("Gesamt: " + euro(receipt.total_cents), { align: "right" });
  doc.font("Helvetica").text("Zahlung:");
  for (const payment of payments) {
    const label = ({cash:"Bar",card:"Karte",mollie_center:"Online-Zahlung"})[payment.method] || payment.method;
    doc.text("  " + label + ": " + euro(payment.amount_cents), { align: "right" });
  }
  if (itemsTotal !== Number(receipt.total_cents)) doc.text("Hinweis: Positionssumme weicht vom Zahlbetrag ab.");

  for (const [rate, group] of [...vat].sort((a, b) => a[0] - b[0])) {
    doc.text("MwSt. " + rate.toLocaleString("de-DE") + " % · Netto: " + euro(group.gross - group.tax));
    doc.text("Steuer: " + euro(group.tax) + " · Brutto: " + euro(group.gross));
  }

  doc.moveDown();
  const qrSize = 78;
  const qrX = (doc.page.width - qrSize) / 2;
  doc.image(qrBuffer, qrX, doc.y, { width: qrSize, height: qrSize });
  doc.x = doc.page.margins.left;
  doc.fontSize(7).fillColor("#52677a").text("QR: Digitalen Beleg öffnen", { align: "center" });
  if(receipt.fiscal_status!=="signed")doc.moveDown().fontSize(8).fillColor("#9b2226").text("Nicht TSE-signiert – kein fiskalisierter Kassenbeleg.");
        doc.end();
      }catch(error){fail(error);}
    });
  }catch{
    send(res,503,{error:"Der Beleg konnte noch nicht als PDF erstellt werden. Bitte später erneut versuchen."});
    return true;
  }
  res.writeHead(200,{
    "content-type":"application/pdf",
    "content-disposition":"attachment; filename=Beleg-"+receipt.receipt_number+".pdf",
    "cache-control":"private, no-store"
  });
  res.end(pdf);
  return true;
}
;
}
