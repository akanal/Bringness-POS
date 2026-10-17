import {readJsonObject} from './http-body.js';
import crypto from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(status,message,code)=>{throw Object.assign(Error(message),{status,code});};
export async function migrateTableSettlement(db){
 await db.query(`CREATE TABLE IF NOT EXISTS pos_table_settlements(
  company_id uuid NOT NULL REFERENCES companies(id),request_key uuid NOT NULL,
  table_id uuid NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,request_key));`);
}
export function createTableSettlement(pool){return async(req,res)=>{
 if(new URL(req.url,'http://local').pathname!=='/api/v1/tables/settle'||req.method!=='POST')return false;
 const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));return true;};
 let client;
 try{
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return send(401,{error:'Nicht angemeldet'});
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const body=await readJsonObject(req,{maxBytes:65536});
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.requestKey!=='string'||typeof body.tableId!=='string'||!uuid.test(body.requestKey)||!uuid.test(body.tableId))fail(400,'Tisch und eindeutige Zahlungskennung erforderlich');
  if(body.paymentMethod!=='cash')fail(409,'Kartenzahlung erst nach serverseitig verifizierter Terminalanbindung verfügbar');
  if(!Array.isArray(body.orderIds)||body.orderIds.length<1||body.orderIds.length>500||body.orderIds.some(id=>typeof id!=='string'||!uuid.test(id))||!Number.isSafeInteger(body.expectedTotalCents)||body.expectedTotalCents<=0||body.expectedTotalCents>2147483647)fail(400,'Bestellungen und bestätigter Gesamtbetrag erforderlich');
  const orderIds=body.orderIds.map(id=>id.toLowerCase()).sort();
  if(new Set(orderIds).size!==orderIds.length)fail(400,'Doppelte Bestellkennung');
  const requestKey=body.requestKey.toLowerCase(),tableId=body.tableId.toLowerCase();
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({tableId,orderIds,total:body.expectedTotalCents,method:'cash'})).digest('hex');
  client=await pool.connect();await client.query('BEGIN');
  const user=(await client.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false) FOR SHARE OF u,s",[tokenHash])).rows[0];
  if(!user)fail(401,'Nicht angemeldet');if(!['owner','admin','manager'].includes(user.role))fail(403,'Nur Restaurantverwaltung darf Zahlungen verbuchen');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.company_id+':table-settlement:'+requestKey]);
  const table=(await client.query('SELECT t.id,t.restaurant_id FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.id=$1 AND r.company_id=$2 FOR UPDATE OF t',[tableId,user.company_id])).rows[0];
  if(!table)fail(404,'Tisch nicht gefunden');
  const previous=(await client.query('SELECT fingerprint,response FROM pos_table_settlements WHERE company_id=$1 AND request_key=$2',[user.company_id,requestKey])).rows[0];
  if(previous){if(previous.fingerprint!==fingerprint)fail(409,'Zahlungskennung bereits für andere Daten verwendet');await client.query('COMMIT');return send(200,{...previous.response,replayed:true});}
  const orders=(await client.query("SELECT id,total_cents FROM orders WHERE table_id=$1 AND restaurant_id=$2 AND status NOT IN ('paid','cancelled') ORDER BY id FOR UPDATE",[tableId,table.restaurant_id])).rows;
  if(JSON.stringify(orders.map(o=>o.id).sort())!==JSON.stringify(orderIds))fail(409,'Offene Bestellungen haben sich geändert. Tisch erneut prüfen.','SETTLEMENT_CHANGED');
  let total=0;
  for(const order of orders){if(!Number.isSafeInteger(order.total_cents)||order.total_cents<=0)fail(409,'Ungültiger Bestellbetrag');total+=order.total_cents;}
  if(!Number.isSafeInteger(total)||total!==body.expectedTotalCents)fail(409,'Bestellbetrag hat sich geändert. Tisch erneut prüfen.','SETTLEMENT_CHANGED');
  const receiptNumbers=[],receiptIds=[];
  for(const order of orders){
   // Never add a second payment or receipt to an inconsistent historical order.
   if((await client.query('SELECT 1 FROM payments WHERE order_id=$1 UNION ALL SELECT 1 FROM receipts WHERE order_id=$1 LIMIT 1',[order.id])).rows.length)fail(409,'Bestellung hat bereits Zahlungs- oder Belegdaten. Manuell abgleichen.');
   await client.query("INSERT INTO payments(order_id,method,amount_cents) VALUES($1,'cash',$2)",[order.id,order.total_cents]);
   const number='BN-'+new Date().getUTCFullYear()+'-'+String((await client.query("SELECT nextval('receipt_number_seq') n")).rows[0].n).padStart(6,'0');
   const receipt=(await client.query('INSERT INTO receipts(order_id,receipt_number) VALUES($1,$2) RETURNING id',[order.id,number])).rows[0];
   await client.query("UPDATE receipts rc SET merchant_snapshot=(SELECT jsonb_build_object('businessName',COALESCE(NULLIF(b.company_name,''),co.name),'restaurantName',r.name,'street',COALESCE(b.street,''),'postalCode',COALESCE(b.postal_code,''),'city',COALESCE(b.city,''),'vatId',COALESCE(b.vat_id,'')) FROM orders ord JOIN restaurants r ON r.id=ord.restaurant_id JOIN companies co ON co.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=co.id WHERE ord.id=rc.order_id) WHERE rc.order_id=$1",[order.id]);
   await client.query("UPDATE orders SET status='paid',closed_at=now() WHERE id=$1",[order.id]);receiptNumbers.push(number);receiptIds.push(receipt.id);
  }
  await client.query("UPDATE dining_tables SET status='free' WHERE id=$1",[tableId]);
  const result={requestKey,tableId,paidOrders:orders.length,totalCents:total,receiptNumbers,receiptIds,method:'cash'};
  await client.query('INSERT INTO pos_table_settlements(company_id,request_key,table_id,fingerprint,response) VALUES($1,$2,$3,$4,$5::jsonb)',[user.company_id,requestKey,tableId,fingerprint,JSON.stringify(result)]);
  await client.query('COMMIT');return send(200,result);
 }catch(error){if(client)await client.query('ROLLBACK');if(error.status)return send(error.status,{error:error.message,code:error.code});return send(503,{error:'Zahlungsstatus nicht bestätigt. Mit derselben Kennung erneut abgleichen.'});}
 finally{client?.release();}
};}
