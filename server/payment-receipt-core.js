import {renderTradeInvoice} from './trade-invoice-pdf.js';
import {lineDiscount} from './sale-discount.js';
import {receiptLines} from './receipt-lines.js';
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
  const match = pathname.match(/^\/api\/v1\/receipts\/([0-9a-f-]{36})\/(pdf|invoice)$/);
  if (!match || req.method !== "GET") return false;

  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[1])){send(res,404,{error:'Beleg nicht gefunden'});return true;}
  const user = await currentUser(req);
  if (!user) {
    send(res, 401, { error: "Nicht angemeldet" });
    return true;
  }

  if(match[2]==='invoice'&&!['owner','admin','manager'].includes(user.role)){send(res,403,{error:'Kein Verwaltungszugang'});return true;}
  const receiptId = match[1];
  const q = await pool.query(
    "SELECT rc.receipt_number,rc.issued_at,rc.public_token,rc.fiscal_status,rc.merchant_snapshot,to_jsonb(rc)->'sale_adjustment' AS sale_adjustment,o.id order_id,o.total_cents,r.name restaurant_name,c.name company_name,b.company_name billing_name,b.street,b.postal_code,b.city,b.vat_id FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id JOIN companies c ON c.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=c.id WHERE rc.id=$1 AND c.id=$2",
    [receiptId, user.company_id]
  );
  if (!q.rowCount) {
    send(res, 404, { error: "Beleg nicht gefunden" });
    return true;
  }

  const receipt = q.rows[0];
  if(match[2]==='invoice'){
    const trade=await pool.query('SELECT recipient FROM pos_trade_sales WHERE order_id=$1',[receipt.order_id]);
    if(!trade.rows[0]){send(res,404,{error:'Keine Händlerrechnung zu diesem Beleg'});return true;}
    const sessionHash=crypto.createHash('sha256').update(String(req.headers.authorization||'').replace(/^Bearer /,'')).digest('hex');
    const access=await issueInvoiceToken(pool,receiptId,user.company_id,sessionHash);
    if(!access){send(res,403,{error:'Verwaltungszugang nicht mehr aktiv'});return true;}
    receipt.invoice_public_token=access;
    receipt.formatA4=true;receipt.recipient=trade.rows[0].recipient;
  }
  let pdf;
  try{pdf=await renderPaymentReceipt(pool,PDFDocument,QRCode,receiptUrl,req,q.rows[0]);}
  catch{send(res,503,{error:'Der Beleg konnte noch nicht als PDF erstellt werden. Bitte später erneut versuchen.'});return true;}
  res.writeHead(200,{
    "content-type":"application/pdf",
    "content-disposition":"attachment; filename="+(receipt.formatA4?"Rechnung-":"Beleg-")+receipt.receipt_number+".pdf",
    "cache-control":"private, no-store"
  });
  res.end(pdf);
  return true;
}
;
}

export async function renderPaymentReceipt(pool,PDFDocument,QRCode,receiptUrl,req,receipt){
 const euro=cents=>(Number(cents||0)/100).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" EUR";
  if (receipt.merchant_snapshot) {
    const snapshot = receipt.merchant_snapshot;
    receipt.restaurant_name = snapshot.restaurantName;
    receipt.billing_name = snapshot.businessName;
    receipt.contact_name = snapshot.contactName || '';
    receipt.street = snapshot.street;
    receipt.postal_code = snapshot.postalCode;
    receipt.city = snapshot.city;
    receipt.vat_id = snapshot.vatId;
    receipt.document_details = snapshot.documentDetails || {};
  }

  const [itemsResult, paymentsResult] = await Promise.all([
    pool.query("SELECT product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity FROM order_items WHERE order_id=$1 ORDER BY id", [receipt.order_id]),
    pool.query("SELECT method,amount_cents,created_at FROM payments WHERE order_id=$1 ORDER BY created_at,id", [receipt.order_id]),
  ]);
  const items = itemsResult.rows;
  const payments = paymentsResult.rows;
  let qrBuffer;
  try {
    const qrPayload=receipt.formatA4?tradeInvoiceUrl(req,receipt.invoice_public_token,receiptUrl):receiptUrl(req,receipt.public_token);
    qrBuffer=await QRCode.toBuffer(qrPayload,{width:120,margin:1});
  } catch {
    throw Error('RECEIPT_PDF_UNAVAILABLE');
  }
  const height = Math.max(560, 390 + items.length * 34 + payments.length * 20);
  let pdf;
  try {
    pdf=await new Promise((resolve,reject)=>{
      const doc=new PDFDocument(receipt.formatA4?{size:"A4",margin:48}:{size:[226.77,height],margin:18});
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
  if(receipt.formatA4){
    renderTradeInvoice(doc,receipt,items,payments,qrBuffer);
    doc.end();
    return;
  }
  doc.fontSize(13).font("Helvetica-Bold").text(receipt.restaurant_name);
  doc.fontSize(9).font("Helvetica").text(receipt.billing_name || receipt.company_name);
  if (receipt.street) doc.text(receipt.street);
  if (receipt.postal_code || receipt.city) doc.text([receipt.postal_code, receipt.city].filter(Boolean).join(" "));
  if (receipt.vat_id) doc.text("USt-IdNr.: " + receipt.vat_id);
  if(receipt.formatA4){
    doc.moveDown().fontSize(18).font('Helvetica-Bold').text('Rechnung '+receipt.receipt_number);
    doc.moveDown().fontSize(10).font('Helvetica').text('Rechnungsempfänger');
    for(const key of ['name','street'])doc.text(receipt.recipient[key]);
    doc.text(receipt.recipient.postalCode+' '+receipt.recipient.city).text(receipt.recipient.country);
    if(receipt.recipient.vatId)doc.text('USt-IdNr.: '+receipt.recipient.vatId);
    doc.moveDown().text('Lieferdatum: '+new Date(receipt.issued_at).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'}));
    doc.text('Alle Einzelpreise sind Bruttopreise. Steueraufschlüsselung siehe unten.');
  }else doc.moveDown().text("Beleg: " + receipt.receipt_number);
  doc.text("Datum: " + new Date(receipt.issued_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) + " Uhr");
  doc.moveDown();

  const vat = new Map();
  let itemsTotal = 0;
  for (const item of items) {
    const gross = Math.round(Number(item.unit_price_cents) * Number(item.quantity))-lineDiscount(receipt.sale_adjustment,item.product_id);
    const rate = Number(item.tax_rate_snapshot);
    const tax = gross - Math.round(gross / (1 + rate / 100));
    itemsTotal += gross;
    const group = vat.get(rate) || { gross: 0, tax: 0 };
    group.gross += gross;
    group.tax += tax;
    vat.set(rate, group);
  }
  for (const item of receiptLines(items,receipt.sale_adjustment)) {
    doc.font("Helvetica-Bold").text(item.product_name_snapshot);
    doc.font("Helvetica").text(Number(item.quantity).toLocaleString("de-DE") + " x " + euro(item.unit_price_cents) + "    " + euro(item.grossCents), { align: "right" });
  }

  if(receipt.sale_adjustment)doc.moveDown().font('Helvetica').text('Zwischensumme: '+euro(receipt.sale_adjustment.subtotalCents)).text('Rabatt: -'+euro(receipt.sale_adjustment.discountCents));
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
  // Reserve the entire QR/footer block; PDFKit images with explicit coordinates do not advance y.
  if (doc.y + qrSize + 58 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const qrX = (doc.page.width - qrSize) / 2;
  const qrY = doc.y;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  doc.y = qrY + qrSize + 8;
  doc.x = doc.page.margins.left;
  doc.fontSize(7).fillColor("#52677a").text("QR: Digitalen Beleg öffnen", { align: "center" });
  if(receipt.fiscal_status!=="signed")doc.moveDown().fontSize(8).fillColor("#9b2226").text("Nicht TSE-signiert – kein fiskalisierter Kassenbeleg.");
        doc.end();
      }catch(error){fail(error);}
    });
  }catch{
    throw Error('RECEIPT_PDF_UNAVAILABLE');
  }
  return pdf;
}


async function issueInvoiceToken(pool,receiptId,companyId,sessionHash){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const actor=await client.query(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id
   WHERE s.token_hash=$1 AND s.expires_at>now() AND u.company_id=$2 AND u.status='active'
   AND u.role IN ('owner','admin','manager') AND coalesce(u.must_change_password,false)=false FOR SHARE OF u,s`,[sessionHash,companyId]);
  if(!actor.rows.length){await client.query('ROLLBACK');return null;}
  const result=await client.query(`UPDATE receipts rc SET invoice_public_token=coalesce(rc.invoice_public_token,gen_random_uuid())
   FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE rc.id=$1 AND rc.order_id=o.id AND r.company_id=$2
   RETURNING rc.invoice_public_token`,[receiptId,companyId]);
  await client.query('COMMIT');return result.rows[0]?.invoice_public_token||null;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

const invoiceTokenPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function tradeInvoiceUrl(req,token,receiptUrl){
 if(typeof token!=='string'||!invoiceTokenPattern.test(token))throw Error('INVOICE_LINK_UNAVAILABLE');
 const base=new URL(receiptUrl(req,token));
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('INVOICE_LINK_UNAVAILABLE');
 return base.origin+'/rechnung/'+token;
}

// A separate, owner-issued capability exposes exactly the invoice printed on the QR.
// Ordinary receipt capabilities and internal receipt/order IDs are never accepted here.
export function createPublicTradeInvoiceHandler(pool,PDFDocument,QRCode,receiptUrl){
 return async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;if(!path.startsWith('/rechnung/'))return false;
  const headers={'cache-control':'private, no-store','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
  const fail=(status,message)=>{res.writeHead(status,{...headers,'content-type':'text/plain; charset=utf-8',...(status===405?{allow:'GET'}:{})});res.end(message);return true;};
  const token=path.slice('/rechnung/'.length);if(!invoiceTokenPattern.test(token))return fail(404,'Rechnung nicht gefunden');
  if(req.method!=='GET')return fail(405,'Methode nicht erlaubt');
  try{
   const result=await pool.query(`SELECT rc.receipt_number,rc.issued_at,rc.public_token,rc.invoice_public_token,rc.fiscal_status,rc.merchant_snapshot,to_jsonb(rc)->'sale_adjustment' AS sale_adjustment,o.id order_id,o.total_cents,r.name restaurant_name,c.name company_name,b.company_name billing_name,b.street,b.postal_code,b.city,b.vat_id,t.recipient
    FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN pos_trade_sales t ON t.order_id=o.id JOIN restaurants r ON r.id=o.restaurant_id JOIN companies c ON c.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=c.id WHERE rc.invoice_public_token=$1`,[token]);
   if(!result.rows[0])return fail(404,'Rechnung nicht gefunden');
   const receipt={...result.rows[0],formatA4:true};
   const pdf=await renderPaymentReceipt(pool,PDFDocument,QRCode,receiptUrl,req,receipt);
   const filename='Rechnung-'+String(receipt.receipt_number).replace(/[^a-z0-9_.-]/gi,'_')+'.pdf';
   res.writeHead(200,{...headers,'content-type':'application/pdf','content-disposition':'inline; filename="'+filename+'"'});res.end(pdf);return true;
  }catch{return fail(503,'Rechnung derzeit nicht verfügbar. Bitte erneut versuchen.');}
 };
}
