import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function allocatePartial(lines,selection){
 const balances=lines.map(l=>({...l,remainingCents:Number(l.gross_cents)-Number(l.paid_cents||0)}));
 if(balances.some(l=>!Number.isSafeInteger(l.remainingCents)||l.remainingCents<0))fail(409,'Positionssaldo muss geprüft werden');
 let allocations=[];
 if(selection.items){
  if(!Array.isArray(selection.items)||!selection.items.length||selection.items.length>500||new Set(selection.items.map(i=>i.lineId)).size!==selection.items.length)fail(400,'Positionen auswählen');
  for(const item of selection.items){const line=balances.find(l=>l.id===item.lineId);if(!line||!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>999999)fail(400,'Ungültige Positionsmenge');const cents=Number(line.unit_price_cents)*item.qty;if(!Number.isSafeInteger(cents)||cents<=0||cents>line.remainingCents)fail(409,'Position ist bereits teilweise bezahlt. Restbetrag verwenden.');allocations.push({lineId:line.id,orderId:line.order_id,cents});}
 }else{
  let rest=selection.amountCents;if(!Number.isSafeInteger(rest)||rest<=0||rest>2147483647)fail(400,'Positiven Centbetrag eingeben');
  for(const line of balances){const cents=Math.min(rest,line.remainingCents);if(cents)allocations.push({lineId:line.id,orderId:line.order_id,cents});rest-=cents;if(!rest)break;}
  if(rest)fail(409,'Betrag übersteigt den offenen Saldo');
 }
 return allocations;
}
export async function migratePartialSettlement(db){await db.query(`
 CREATE TABLE IF NOT EXISTS pos_partial_requests(company_id uuid NOT NULL REFERENCES companies(id),request_key uuid NOT NULL,table_id uuid NOT NULL REFERENCES dining_tables(id),fingerprint text NOT NULL,response jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_id,request_key));
 CREATE TABLE IF NOT EXISTS pos_partial_allocations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,request_key uuid NOT NULL,order_id uuid NOT NULL REFERENCES orders(id),line_id uuid NOT NULL REFERENCES order_items(id),payment_id uuid NOT NULL REFERENCES payments(id),amount_cents int NOT NULL CHECK(amount_cents>0),FOREIGN KEY(company_id,request_key) REFERENCES pos_partial_requests(company_id,request_key) DEFERRABLE INITIALLY DEFERRED);
 CREATE INDEX IF NOT EXISTS pos_partial_order ON pos_partial_allocations(order_id);
 CREATE OR REPLACE FUNCTION pos_partial_protect() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE oid uuid;
 BEGIN
 IF TG_TABLE_NAME='orders' THEN oid:=OLD.id;ELSE IF TG_OP='INSERT' THEN oid:=NEW.order_id;ELSE oid:=OLD.order_id;END IF;PERFORM 1 FROM orders WHERE id=ANY(ARRAY[oid,(to_jsonb(NEW)->>'order_id')::uuid]) ORDER BY id FOR UPDATE;END IF;
 IF EXISTS(SELECT 1 FROM pos_partial_allocations WHERE order_id=oid OR (TG_TABLE_NAME='order_items' AND TG_OP='UPDATE' AND order_id=(to_jsonb(NEW)->>'order_id')::uuid)) THEN
 IF TG_TABLE_NAME='orders' THEN
 IF TG_OP='DELETE' OR NEW.total_cents<>OLD.total_cents OR NEW.restaurant_id<>OLD.restaurant_id OR NEW.table_id IS DISTINCT FROM OLD.table_id OR NEW.status='cancelled' THEN RAISE EXCEPTION 'Teilzahlung vorhanden: Finanzdaten bleiben erhalten'; END IF;
 ELSE RAISE EXCEPTION 'Teilzahlung vorhanden: Positionen bleiben erhalten';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END $$;
 DROP TRIGGER IF EXISTS pos_partial_order_guard ON orders;CREATE TRIGGER pos_partial_order_guard BEFORE UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION pos_partial_protect();
 DROP TRIGGER IF EXISTS pos_partial_item_guard ON order_items;CREATE TRIGGER pos_partial_item_guard BEFORE INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION pos_partial_protect();
 `);}
export function createPartialSettlement(pool){return async(req,res)=>{
 const url=new URL(req.url,'http://local');if(url.pathname!=='/api/v1/tables/partial'||!['GET','POST'].includes(req.method))return false;
 const send=(s,b)=>{res.writeHead(s,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(b));return true;};let c;
 try{
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return send(401,{error:'Nicht angemeldet'});
 const b=req.method==='POST'?await readJsonObject(req,{maxBytes:65536}):{tableId:url.searchParams.get('tableId')};
 if(!uuid.test(b.tableId||''))fail(400,'Tisch erforderlich');
 if(req.method==='POST'&&(!uuid.test(b.requestKey||'')||b.paymentMethod!=='cash'||!Number.isSafeInteger(b.expectedRemainingCents)||b.expectedRemainingCents<=0||!!b.items===!!b.amountCents))fail(400,'Barzahlung, Saldo und eindeutige Vorgangskennung erforderlich');
 c=await pool.connect();await c.query('BEGIN');
 const actor=(await c.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false) FOR SHARE OF u,s",[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
 if(!actor)fail(401,'Nicht angemeldet');if(!['owner','admin','manager'].includes(actor.role))fail(403,'Kein Kassenzugang');
 const table=(await c.query('SELECT t.id,t.restaurant_id FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.id=$1 AND r.company_id=$2 FOR UPDATE OF t',[b.tableId,actor.company_id])).rows[0];if(!table)fail(404,'Tisch nicht gefunden');
 let fingerprint;
 if(req.method==='POST'){
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.company_id+':partial:'+b.requestKey.toLowerCase()]);
 fingerprint=crypto.createHash('sha256').update(JSON.stringify({tableId:table.id,expectedRemainingCents:b.expectedRemainingCents,items:b.items||null,amountCents:b.amountCents||null,method:'cash'})).digest('hex');
 const old=(await c.query('SELECT fingerprint,response FROM pos_partial_requests WHERE company_id=$1 AND request_key=$2',[actor.company_id,b.requestKey])).rows[0];if(old){if(old.fingerprint!==fingerprint)throw Object.assign(Error('Kennung wurde bereits anders verwendet'),{status:409,collision:true});await c.query('COMMIT');return send(200,{...old.response,replayed:true});}
 }
 const orders=(await c.query("SELECT id,total_cents,status FROM orders WHERE table_id=$1 AND restaurant_id=$2 AND status NOT IN ('paid','cancelled') ORDER BY id FOR UPDATE",[table.id,table.restaurant_id])).rows;
 const ids=orders.map(o=>o.id);
 const lines=(await c.query('SELECT oi.id,oi.order_id,oi.product_name_snapshot,oi.unit_price_cents,oi.quantity,round(oi.unit_price_cents*oi.quantity)::int gross_cents,coalesce((SELECT sum(a.amount_cents)::int FROM pos_partial_allocations a WHERE a.line_id=oi.id),0) paid_cents FROM order_items oi WHERE oi.order_id=ANY($1::uuid[]) ORDER BY oi.order_id,oi.id FOR UPDATE OF oi',[ids])).rows;
 for(const order of orders){
 const total=lines.filter(l=>l.order_id===order.id).reduce((s,l)=>s+Number(l.gross_cents),0);if(total!==order.total_cents||lines.some(l=>l.order_id===order.id&&Number(l.gross_cents)<0))fail(409,'Bestellung erfordert gesonderten Zahlungsabgleich');
 if((await c.query('SELECT 1 FROM receipts WHERE order_id=$1 UNION ALL SELECT 1 FROM payments p WHERE p.order_id=$1 AND NOT EXISTS(SELECT 1 FROM pos_partial_allocations a WHERE a.payment_id=p.id) LIMIT 1',[order.id])).rows.length)fail(409,'Vorhandene Zahlungsdaten müssen zuerst abgeglichen werden');
 }
 const remaining=lines.reduce((s,l)=>s+Number(l.gross_cents)-Number(l.paid_cents),0);
 if(req.method==='GET'){const confirmations=(await c.query('SELECT response,created_at FROM pos_partial_requests WHERE table_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 100',[table.id,actor.company_id])).rows;await c.query('COMMIT');return send(200,{tableId:table.id,restaurantId:table.restaurant_id,remainingCents:remaining,confirmations,lines:lines.map(l=>({...l,remainingCents:Number(l.gross_cents)-Number(l.paid_cents)}))});}
 if(remaining!==b.expectedRemainingCents)fail(409,'Saldo hat sich geändert. Neu laden und Zahlung erneut prüfen.');
 const allocations=allocatePartial(lines,b),amount=allocations.reduce((s,a)=>s+a.cents,0);if(!amount)fail(400,'Zahlbetrag fehlt');
 const receipts=[];
 for(const order of orders){const parts=allocations.filter(a=>a.orderId===order.id);if(!parts.length)continue;
 // Preserve stock acceptance/preparation rules before accepting any money.
 if((await c.query("SELECT to_regclass('pos_stock_commands') present")).rows[0]?.present&&(await c.query("SELECT 1 FROM pos_stock_commands WHERE order_id=$1 AND state='pending' LIMIT 1",[order.id])).rows.length)fail(409,'Lagerbuchung zuerst abschließen');
 if(['open','kitchen'].includes(order.status)&&(await c.query("SELECT 1 FROM pos_stock_links WHERE restaurant_id=$1 AND active=true LIMIT 1",[table.restaurant_id])).rows.length)fail(409,'Lagerauftrag zuerst annehmen und Zubereitung starten');
 const payment=(await c.query("INSERT INTO payments(order_id,method,amount_cents) VALUES($1,'cash',$2) RETURNING id",[order.id,parts.reduce((s,a)=>s+a.cents,0)])).rows[0];
 for(const part of parts)await c.query('INSERT INTO pos_partial_allocations(company_id,request_key,order_id,line_id,payment_id,amount_cents) VALUES($1,$2,$3,$4,$5,$6)',[actor.company_id,b.requestKey,order.id,part.lineId,payment.id,part.cents]);
 const outstanding=lines.filter(l=>l.order_id===order.id).reduce((s,l)=>s+Number(l.gross_cents)-Number(l.paid_cents),0)-parts.reduce((s,a)=>s+a.cents,0);
 if(!outstanding){
 const number='BN-'+new Date().getUTCFullYear()+'-'+String((await c.query("SELECT nextval('receipt_number_seq') n")).rows[0].n).padStart(6,'0');
 await c.query("UPDATE orders SET status='paid',closed_at=now() WHERE id=$1",[order.id]);
 const receipt=(await c.query('INSERT INTO receipts(order_id,receipt_number) VALUES($1,$2) RETURNING id',[order.id,number])).rows[0];
 await c.query("UPDATE receipts rc SET merchant_snapshot=(SELECT jsonb_build_object('businessName',COALESCE(NULLIF(b.company_name,''),co.name),'restaurantName',r.name,'street',COALESCE(b.street,''),'postalCode',COALESCE(b.postal_code,''),'city',COALESCE(b.city,''),'vatId',COALESCE(b.vat_id,'')) FROM orders ord JOIN restaurants r ON r.id=ord.restaurant_id JOIN companies co ON co.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=co.id WHERE ord.id=rc.order_id) WHERE rc.id=$1",[receipt.id]);receipts.push({id:receipt.id,number});
 }
 }
 const rest=remaining-amount;if(!rest)await c.query("UPDATE dining_tables SET status='free' WHERE id=$1",[table.id]);
 const result={requestKey:b.requestKey,tableId:table.id,amountCents:amount,remainingCents:rest,method:'cash',receipts,confirmation:'TZ-'+b.requestKey,lines:allocations.map(a=>({...a,name:lines.find(l=>l.id===a.lineId).product_name_snapshot}))};
 await c.query('INSERT INTO pos_partial_requests(company_id,request_key,table_id,fingerprint,response,actor_id) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[actor.company_id,b.requestKey,table.id,fingerprint,JSON.stringify(result),actor.id]);await c.query('COMMIT');return send(200,result);
 }catch(e){if(c)await c.query('ROLLBACK');return send(e.status||503,{error:e.status?e.message:'Zahlungsstatus unklar. Mit derselben Kennung erneut abgleichen.',rejected:!!e.status&&!e.collision});}finally{c?.release();}
 };}
