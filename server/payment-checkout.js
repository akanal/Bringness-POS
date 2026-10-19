import {migrateDeposit,createDepositHandler,depositQuote,reserveDepositCredit} from './pos-deposit.js';
import {migrateCashClosing,createCashClosing} from './cash-closing.js';
import {migrateCustomerDelivery,createCustomerDelivery} from './customer-delivery.js';
import {normalizeDiscount,discountedSale} from './sale-discount.js';
import {migrateParkedBons,createParkedBons} from './parked-bons.js';
import {migrateTrade,createTradeHandler,tradeRecipient,tradePrice,tradeQuantityLimit} from './trade-pricing.js';
import {readJsonObject} from './http-body.js';
import {cleanMailAddress,enqueuePaidReceipt} from './transactional-mail.js';
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function migratePaymentCheckout(db=pool){
 await migrateTrade(db);await migrateParkedBons(db);await migrateCustomerDelivery(db);await migrateCashClosing(db);await migrateDeposit(db);
 await db.query(`CREATE TABLE IF NOT EXISTS pos_checkout_requests(
  company_id uuid NOT NULL REFERENCES companies(id),request_key uuid NOT NULL,
  fingerprint text NOT NULL,order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,request_key));`);
}

export function createPaymentCheckout(pool){
function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

const readBody=req=>readJsonObject(req,{maxBytes:65536});

async function currentUser(req,db=pool,lock=false) {
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const q = await db.query(
    "SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)"+(lock?" FOR SHARE OF u,s":""),
    [tokenHash]
  );
  return q.rows[0] || null;
}

const cashHandler=createCashClosing(pool,currentUser),depositHandler=createDepositHandler(pool,currentUser);
const tradeHandler=createTradeHandler(pool,currentUser),parkedHandler=createParkedBons(pool,currentUser),customerDeliveryHandler=createCustomerDelivery(pool,currentUser);
return async function handlePaymentCheckout(req, res) {
  if(await depositHandler(req,res))return true;
  if(await cashHandler(req,res))return true;
  if(await customerDeliveryHandler(req,res))return true;
  if(await parkedHandler(req,res))return true;
  if(await tradeHandler(req,res))return true;
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/api/v1/orders/checkout" || req.method !== "POST") return false;

  const user = await currentUser(req);
  if (!user) {
    send(res, 401, { error: "Nicht angemeldet" });
    return true;
  }
  if (!["owner", "admin", "manager"].includes(user.role)) {
    send(res, 403, { error: "Dieser Bereich ist nur für die Restaurantverwaltung freigegeben" });
    return true;
  }

  let body;
  try { body = await readBody(req); }
  catch (error) {
    send(res, error.status === 413 ? 413 : 400, { error: error.status === 413 ? "Anfrage zu groß" : "Ungültige Anfrage" });
    return true;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) { send(res, 400, { error: "Ungültige Anfrage" }); return true; }
  let receiptEmail='';try{if(body.receiptEmail)receiptEmail=cleanMailAddress(body.receiptEmail);}catch{send(res,400,{error:'Gültige Beleg-E-Mail erforderlich'});return true;}
  const trade=body.salesMode==='trade';let recipient=null;
  if(body.salesMode!=null&&!['retail','trade'].includes(body.salesMode)){send(res,400,{error:'Ungültiger Verkaufsmodus'});return true;}
  if(trade){try{recipient=tradeRecipient(body.recipient)}catch(e){send(res,400,{error:e.message});return true;}}
  let discount;try{discount=normalizeDiscount(body.discount)}catch(e){send(res,400,{error:e.message});return true;}
  let depositReturns=[];if(body.depositReturns!=null){if(!Array.isArray(body.depositReturns)||!body.depositReturns.length||body.depositReturns.length>100||body.depositReturns.some(i=>!i||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(i.lineId||'')||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>9999999)||new Set(body.depositReturns.map(i=>i.lineId)).size!==body.depositReturns.length||typeof body.depositReturnReason!=='string'||!body.depositReturnReason.trim()||body.depositReturnReason.length>300||/[\x00-\x1f\x7f]/.test(body.depositReturnReason)||!Number.isSafeInteger(body.depositCreditCents)||body.depositCreditCents<=0){send(res,400,{error:'Ungültige Pfandverrechnung'});return true;}depositReturns=body.depositReturns.map(i=>({lineId:i.lineId,qty:i.qty})).sort((a,b)=>a.lineId.localeCompare(b.lineId));}
  const parked=body.parkedBonId!=null;
  if(parked&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.parkedBonId)||!Number.isSafeInteger(body.parkedBonVersion)||body.parkedBonVersion<1)){send(res,400,{error:'Ungültiger geparkter Bon'});return true;}
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 100) { send(res, 400, { error: "Zu viele Warenkorbpositionen" }); return true; }
  const payments = Array.isArray(body.payments) ? body.payments : [];
  const restaurantId = String(body.restaurantId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(restaurantId)) { send(res, 400, { error: "Ungültige Betriebskennung" }); return true; }
  if (!restaurantId || !items.length) {
    send(res, 400, { error: "Betrieb und Warenkorb sind erforderlich" });
    return true;
  }
  if (!payments.length || payments.length > 2) {
    send(res, 400, { error: "Mindestens eine Zahlungsart ist erforderlich" });
    return true;
  }
  if (payments.some(p => !p || typeof p !== "object" || !["cash", "card"].includes(String(p.method)) || !Number.isSafeInteger(p.amountCents) || p.amountCents <= 0)) {
    send(res, 400, { error: "Ungültige Zahlungsaufteilung" });
    return true;
  }

  // A client-supplied confirmation flag is not proof of a settled terminal payment.
  // Keep card settlement disabled until a server-verified provider integration exists.
  if (payments.some(p => p.method === "card")) {
    send(res, 409, { error: "Kartenzahlung erst nach serverseitig verifizierter Terminalbestätigung verfügbar" });
    return true;
  }

  if (items.some(i => !i || typeof i !== "object")) { send(res, 400, { error: "Ungültiger Artikel im Warenkorb" }); return true; }
  const ids = [...new Set(items.map(i => String(i.productId || "")).filter(Boolean))];
  if (!ids.length || ids.length !== items.length || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    send(res, 400, { error: "Ungültiger Artikel im Warenkorb" });
    return true;
  }

  if(typeof body.requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestKey)){
    send(res,400,{error:'Eindeutige Zahlungskennung erforderlich. Bitte Kasse aktualisieren.'});return true;
  }
  if(items.some(item=>!Number.isSafeInteger(item.qty)||item.qty<=0||item.qty>(trade?tradeQuantityLimit:999))){
    send(res,400,{error:'Ungültige Menge'});return true;
  }
  const requestKey=body.requestKey.toLowerCase();
  const canonicalItems=items.map(item=>({productId:item.productId.toLowerCase(),qty:item.qty})).sort((a,b)=>a.productId.localeCompare(b.productId));
  if(new Set(canonicalItems.map(item=>item.productId)).size!==canonicalItems.length){send(res,400,{error:'Doppelte Artikelkennung'});return true;}
  const canonicalPayments=payments.map(p=>({method:p.method,amountCents:p.amountCents}));
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({restaurantId:restaurantId.toLowerCase(),items:canonicalItems,payments:canonicalPayments,receiptEmail,...(trade?{salesMode:'trade',recipient}: {}),...(discount?{discount}:{}),...(depositReturns.length?{depositReturns,depositReturnReason:body.depositReturnReason.trim(),depositCreditCents:body.depositCreditCents}:{}),...(parked?{parkedBonId:body.parkedBonId,parkedBonVersion:body.parkedBonVersion}:{})})).digest('hex');
  const client=await pool.connect();
  const reject=(status,message)=>{throw Object.assign(Error(message),{status});};
  try{
    await client.query('BEGIN');
    const actor=await currentUser(req,client,true);
    if(!actor||actor.id!==user.id||actor.company_id!==user.company_id||!['owner','admin','manager'].includes(actor.role))reject(403,'Kassenzugang nicht mehr freigegeben');
    if(!(await client.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[restaurantId,actor.company_id])).rows.length)reject(403,'Betrieb nicht erlaubt');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.company_id+':checkout:'+requestKey]);
    const previous=(await client.query('SELECT fingerprint,response FROM pos_checkout_requests WHERE company_id=$1 AND request_key=$2',[actor.company_id,requestKey])).rows[0];
    if(previous){
      if(previous.fingerprint!==fingerprint)reject(409,'Zahlungskennung bereits für andere Daten verwendet. Ursprüngliche Zahlung abgleichen.');
      await client.query('COMMIT');send(res,200,{...previous.response,replayed:true});return true;
    }
    if(trade&&!(await client.query('SELECT pos_trade_enabled FROM restaurants WHERE id=$1 AND company_id=$2',[restaurantId,actor.company_id])).rows[0]?.pos_trade_enabled)reject(409,'Händleroption ausgeschaltet. In den Einstellungen aktivieren; bei unklarem Zahlungsergebnis dieselbe Kennung abgleichen.');
    if(parked){const bon=(await client.query('SELECT state,version,payload FROM pos_parked_bons WHERE id=$1 AND company_id=$2 AND restaurant_id=$3 FOR UPDATE',[body.parkedBonId,actor.company_id,restaurantId])).rows[0];if(!bon)reject(404,'Geparkter Bon nicht gefunden');if(bon.state!=='parked')reject(409,'Geparkter Bon wurde bereits bezahlt. Keine neue Zahlung buchen.');if(bon.version!==body.parkedBonVersion||bon.payload.salesMode!==(trade?'trade':'retail'))reject(409,'Geparkter Bon wurde geändert. Bitte neu laden.');}
    const products=await client.query(
      'SELECT p.id,p.name,p.price_cents,p.tax_rate FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE p.id=ANY($1::uuid[]) AND p.restaurant_id=$2 AND r.company_id=$3 AND p.active=true FOR SHARE OF p,r',
      [canonicalItems.map(i=>i.productId),restaurantId,actor.company_id]
    );
    if(products.rows.length!==canonicalItems.length)reject(400,'Ein oder mehrere Artikel sind nicht verfügbar');
    let tradeTiers=[];
    if(trade){
      tradeTiers=(await client.query('SELECT product_id,min_qty,price_cents FROM pos_trade_prices WHERE product_id=ANY($1::uuid[]) ORDER BY product_id,min_qty FOR SHARE',[canonicalItems.map(i=>i.productId)])).rows;
      const seller=(await client.query('SELECT company_name,street,postal_code,city,vat_id FROM company_billing_profiles WHERE company_id=$1 FOR SHARE',[actor.company_id])).rows[0];
      if(!seller||['company_name','street','postal_code','city','vat_id'].some(k=>!String(seller[k]||'').trim()))reject(400,'Für Händlerrechnungen bitte zuerst vollständige Firmendaten und USt-IdNr. im Rechnungsprofil hinterlegen');
    }
    const productMap=new Map(products.rows.map(p=>[p.id,p]));
    const cleanItems=[];let totalCents=0;
    for(const item of canonicalItems){
      const product=productMap.get(item.productId),priceCents=Number(trade?tradePrice(tradeTiers.filter(t=>t.product_id===item.productId).map(t=>({minQty:t.min_qty,priceCents:t.price_cents})),item.qty):product?.price_cents),taxRate=Number(product?.tax_rate);
      if(trade&&!priceCents)reject(400,'Kein Händlerpreis für diese Artikelmenge hinterlegt');
      if(!product||!Number.isSafeInteger(priceCents)||priceCents<0||priceCents>2147483647||!Number.isFinite(taxRate)||taxRate<0||taxRate>100)reject(400,'Ungültiger Artikelpreis oder Steuersatz');
      totalCents+=priceCents*item.qty;cleanItems.push({product:{...product,price_cents:priceCents},qty:item.qty});
    }
    if(!Number.isSafeInteger(totalCents)||totalCents<=0||totalCents>2147483647)reject(400,'Ungültiger Gesamtbetrag');
    let adjustment=null;if(discount){try{adjustment={...discountedSale(cleanItems.map(i=>({id:i.product.id,grossCents:i.product.price_cents*i.qty})),discount),actorId:actor.id};totalCents=adjustment.totalCents}catch(e){reject(400,e.message)}}
    const depositRules=(await client.query('SELECT * FROM pos_deposit_rules WHERE product_id=ANY($1::uuid[]) ORDER BY product_id FOR SHARE',[canonicalItems.map(i=>i.productId)])).rows;
    const depositLines=depositQuote(depositRules,canonicalItems),depositCents=depositLines.reduce((sum,l)=>sum+l.totalCents,0);
    totalCents+=depositCents;if(!Number.isSafeInteger(totalCents)||totalCents>2147483647)reject(400,'Gesamtbetrag einschließlich Pfand zu groß');
    let depositCredit=null;if(depositReturns.length){try{depositCredit=await reserveDepositCredit(client,restaurantId,depositReturns)}catch(e){if(e.status===409)reject(400,e.message);throw e;}}
    if(depositCredit){if(depositCredit.total!==body.depositCreditCents)reject(400,'Pfandrücknahmepreis wurde geändert. Bitte Beleg neu laden.');totalCents-=depositCredit.total;if(totalCents<=0)reject(400,'Bei vollständiger Auszahlung separate Pfandrücknahme verwenden');}
    const paymentTotal=canonicalPayments.reduce((sum,p)=>sum+p.amountCents,0);
    if(!Number.isSafeInteger(paymentTotal)||paymentTotal!==totalCents)reject(400,'Zahlungsaufteilung stimmt nicht mit dem Gesamtbetrag überein');
    await client.query("SELECT set_config('bringness.deposit_checkout','yes',true)");
    const order=(await client.query("INSERT INTO orders(restaurant_id,status,total_cents,closed_at) VALUES($1,'paid',$2,now()) RETURNING id,created_at",[restaurantId,totalCents])).rows[0];
    for(const item of cleanItems)await client.query('INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,$3,$4,$5,$6)',[order.id,item.product.id,item.product.name,item.product.price_cents,item.product.tax_rate,item.qty]);
    for(const l of depositLines){await client.query('INSERT INTO pos_deposit_lines(order_id,product_id,label,unit_cents,tax_rate,quantity) VALUES($1,$2,$3,$4,$5,$6)',[order.id,l.productId,l.label,l.unitCents,l.taxRate,l.qty]);await client.query('INSERT INTO order_items(order_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,$3,$4,$5)',[order.id,'Pfand: '+l.label,l.unitCents,l.taxRate,l.qty]);}
    if(depositCredit){for(const l of depositCredit.lines)await client.query('INSERT INTO order_items(order_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,$3,$4,$5)',[order.id,'Pfandrücknahme: '+l.label,-l.unitCents,l.taxRate,l.qty]);const number='PF-R-'+String((await client.query("SELECT nextval('deposit_return_number_seq') n")).rows[0].n).padStart(8,'0');await client.query('INSERT INTO pos_deposit_returns(id,restaurant_id,request_key,fingerprint,number,amount_cents,lines,reason,actor_id,credited_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[crypto.randomUUID(),restaurantId,requestKey,fingerprint,number,depositCredit.total,JSON.stringify(depositCredit.lines),body.depositReturnReason.trim(),actor.id,order.id]);}
    if(trade)await client.query('INSERT INTO pos_trade_sales(order_id,recipient) VALUES($1,$2::jsonb)',[order.id,JSON.stringify(recipient)]);
    for(const payment of canonicalPayments)await client.query('INSERT INTO payments(order_id,method,amount_cents) VALUES($1,$2,$3)',[order.id,payment.method,payment.amountCents]);
    const receiptNumber=(trade?'HR-':'BN-')+new Date().getUTCFullYear()+'-'+String((await client.query(trade?"SELECT nextval('trade_invoice_number_seq') n":"SELECT nextval('receipt_number_seq') n")).rows[0].n).padStart(6,'0');
    if(adjustment)await client.query('INSERT INTO receipts(order_id,receipt_number,sale_adjustment) VALUES($1,$2,$3::jsonb)',[order.id,receiptNumber,JSON.stringify(adjustment)]);
    else await client.query('INSERT INTO receipts(order_id,receipt_number) VALUES($1,$2)',[order.id,receiptNumber]);
    await client.query("UPDATE receipts rc SET merchant_snapshot=(SELECT jsonb_build_object('businessName',COALESCE(NULLIF(b.company_name,''),co.name),'restaurantName',r.name,'street',COALESCE(b.street,''),'postalCode',COALESCE(b.postal_code,''),'city',COALESCE(b.city,''),'vatId',COALESCE(b.vat_id,'')) FROM orders ord JOIN restaurants r ON r.id=ord.restaurant_id JOIN companies co ON co.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=co.id WHERE ord.id=rc.order_id) WHERE rc.order_id=$1",[order.id]);
    const tradeReceipt=trade?(await client.query('SELECT id FROM receipts WHERE order_id=$1',[order.id])).rows[0]:null;
    if(parked)await client.query("UPDATE pos_parked_bons SET state='paid',order_id=$2,updated_at=now() WHERE id=$1",[body.parkedBonId,order.id]);
    await enqueuePaidReceipt(client,order.id,receiptEmail);
    const response={requestKey,id:order.id,restaurantId:restaurantId.toLowerCase(),totalCents,status:'paid',createdAt:order.created_at,receiptNumber,...(trade?{salesMode:'trade',receiptId:tradeReceipt.id}:{}),emailStatus:receiptEmail?'queued':null,payments:canonicalPayments};
    await client.query('INSERT INTO pos_checkout_requests(company_id,request_key,fingerprint,order_id,response) VALUES($1,$2,$3,$4,$5::jsonb)',[actor.company_id,requestKey,fingerprint,order.id,JSON.stringify(response)]);
    await client.query('COMMIT');send(res,201,response);return true;
  }catch(error){
    await client.query('ROLLBACK');
    if(error.status){send(res,error.status,{error:error.message});return true;}
    throw error;
  }finally{client.release();}
}

}
export const handlePaymentCheckout=createPaymentCheckout(pool);
